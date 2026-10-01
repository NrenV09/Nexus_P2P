/**
 * Nexus Disk & Memory Streaming Engine
 * 
 * Provides zero-RAM direct-to-disk streaming across all desktop and mobile browsers:
 * 1. Chromium Desktop: Native FileSystem Access API (showSaveFilePicker)
 * 2. iOS / iPadOS Safari & Chrome (and modern mobile): Origin Private File System (OPFS)
 * 3. Fallback: IndexedDB disk chunk streaming & active iOS Jetsam memory guard
 */

export interface DiskStreamSupport {
  hasNativePicker: boolean;
  hasOPFS: boolean;
  isIOS: boolean;
  mode: 'native' | 'opfs' | 'idb' | 'memory-guarded';
  label: string;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function getDiskStreamSupport(): DiskStreamSupport {
  const isIOS = isIOSDevice();
  const hasNative = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  const hasOPFS = typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';

  if (hasNative) {
    return {
      hasNativePicker: true,
      hasOPFS,
      isIOS,
      mode: 'native',
      label: 'Chromium Native Direct Disk'
    };
  }

  if (hasOPFS) {
    return {
      hasNativePicker: false,
      hasOPFS: true,
      isIOS,
      mode: 'opfs',
      label: isIOS ? 'iOS / iPadOS OPFS Disk Stream' : 'OPFS Disk Stream'
    };
  }

  return {
    hasNativePicker: false,
    hasOPFS: false,
    isIOS,
    mode: 'memory-guarded',
    label: isIOS ? 'iOS Memory Guarded' : 'Memory Guarded'
  };
}

export interface DiskWriter {
  mode: 'native' | 'opfs' | 'idb' | 'memory';
  isWriting: boolean;
  write: (chunk: ArrayBuffer) => Promise<void>;
  close: () => Promise<Blob | File | null>;
  abort: () => Promise<void>;
}

// --------------------------------------------------------------------------
// OPFS Writer: Writes chunks directly into device sandbox disk without RAM heap
// --------------------------------------------------------------------------
async function createOPFSWriter(fileName: string, mimeType?: string): Promise<DiskWriter> {
  const root = await navigator.storage.getDirectory();
  const sanitized = fileName.replace(/[/\\?%*:|"<>]/g, '_');
  const tempName = `nexus_temp_${Date.now()}_${sanitized}`;
  const fileHandle = await root.getFileHandle(tempName, { create: true });

  if (typeof (fileHandle as any).createWritable === 'function') {
    const writable = await (fileHandle as any).createWritable();
    let isWriting = false;

    return {
      mode: 'opfs',
      isWriting,
      async write(chunk: ArrayBuffer) {
        isWriting = true;
        try {
          await writable.write(chunk);
        } finally {
          isWriting = false;
        }
      },
      async close() {
        await writable.close();
        const file = await fileHandle.getFile();
        // Schedule cleanup after download trigger
        setTimeout(async () => {
          try {
            if (typeof (fileHandle as any).remove === 'function') {
              await (fileHandle as any).remove();
            } else if (typeof (root as any).removeEntry === 'function') {
              await (root as any).removeEntry(tempName);
            }
          } catch (_) {}
        }, 120000);
        return file;
      },
      async abort() {
        try {
          await writable.abort();
        } catch (_) {}
        try {
          if (typeof (fileHandle as any).remove === 'function') {
            await (fileHandle as any).remove();
          } else if (typeof (root as any).removeEntry === 'function') {
            await (root as any).removeEntry(tempName);
          }
        } catch (_) {}
      }
    };
  }

  throw new Error("OPFS createWritable not available on this browser version");
}

// --------------------------------------------------------------------------
// IndexedDB Writer: Persists binary chunks into SQLite on local disk
// --------------------------------------------------------------------------
function openStreamDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nexus_stream_cache', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function createIDBWriter(streamId: string, mimeType?: string): Promise<DiskWriter> {
  const db = await openStreamDB();
  let chunkIndex = 0;
  let isWriting = false;

  return {
    mode: 'idb',
    isWriting,
    async write(chunk: ArrayBuffer) {
      isWriting = true;
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('chunks', 'readwrite');
          const store = tx.objectStore('chunks');
          const item = { id: `${streamId}_${chunkIndex++}`, data: chunk };
          store.put(item);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        isWriting = false;
      }
    },
    async close() {
      // Reassemble sequentially from IDB into a Blob
      const chunks: ArrayBuffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chunks', 'readonly');
        const store = tx.objectStore('chunks');
        const req = store.openCursor();
        req.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.key.toString().startsWith(streamId)) {
              chunks.push(cursor.value.data);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });

      // Clear the temporary stream chunks
      try {
        const cleanTx = db.transaction('chunks', 'readwrite');
        const store = cleanTx.objectStore('chunks');
        for (let i = 0; i < chunkIndex; i++) {
          store.delete(`${streamId}_${i}`);
        }
      } catch (_) {}

      return new Blob(chunks, { type: mimeType || 'application/octet-stream' });
    },
    async abort() {
      try {
        const cleanTx = db.transaction('chunks', 'readwrite');
        const store = cleanTx.objectStore('chunks');
        for (let i = 0; i < chunkIndex; i++) {
          store.delete(`${streamId}_${i}`);
        }
      } catch (_) {}
    }
  };
}

// --------------------------------------------------------------------------
// Factory: Instantiate the most performant and safe disk stream writer
// --------------------------------------------------------------------------
export async function createSafeDiskWriter(
  fileName: string,
  totalSize: number,
  mimeType?: string
): Promise<{ writer: DiskWriter; mode: 'native' | 'opfs' | 'idb' | 'memory'; warning?: string }> {
  const isIOS = isIOSDevice();

  // 1. Desktop Chromium: Native FileSystem Access
  if (typeof window !== 'undefined' && (window as any).showSaveFilePicker) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'Direct Disk Download',
          accept: { [mimeType || 'application/octet-stream']: [] }
        }]
      });
      const writable = await handle.createWritable();
      let isWriting = false;

      const writer: DiskWriter = {
        mode: 'native',
        isWriting,
        async write(chunk: ArrayBuffer) {
          isWriting = true;
          try {
            await writable.write(chunk);
          } finally {
            isWriting = false;
          }
        },
        async close() {
          await writable.close();
          return null; // File already directly on disk!
        },
        async abort() {
          try {
            await writable.abort();
          } catch (_) {}
        }
      };

      return { writer, mode: 'native' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err; // User clicked Cancel in the system file picker
      }
      console.warn("Native showSaveFilePicker failed, trying OPFS fallback:", err);
    }
  }

  // 2. iOS / iPadOS Safari & Chrome (and modern browsers): OPFS Disk Streaming
  if (typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function') {
    try {
      const opfsWriter = await createOPFSWriter(fileName, mimeType);
      return {
        writer: opfsWriter,
        mode: 'opfs',
        warning: isIOS ? 'iOS / iPadOS OPFS direct disk streaming engaged. RAM heap bypassed.' : undefined
      };
    } catch (opfsErr) {
      console.warn("OPFS stream failed, falling back to IndexedDB disk cache:", opfsErr);
    }
  }

  // 3. Fallback: IndexedDB persistent chunk streaming
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    try {
      const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const idbWriter = await createIDBWriter(streamId, mimeType);
      return {
        writer: idbWriter,
        mode: 'idb',
        warning: isIOS ? 'Device disk caching engaged via IndexedDB.' : undefined
      };
    } catch (idbErr) {
      console.warn("IndexedDB disk stream failed, falling back to memory:", idbErr);
    }
  }

  // 4. Memory Fallback
  const chunks: ArrayBuffer[] = [];
  let receivedBytes = 0;

  const memWriter: DiskWriter = {
    mode: 'memory',
    isWriting: false,
    async write(chunk: ArrayBuffer) {
      receivedBytes += chunk.byteLength;
      chunks.push(chunk);
    },
    async close() {
      const blob = new Blob(chunks, { type: mimeType || 'application/octet-stream' });
      chunks.length = 0;
      return blob;
    },
    async abort() {
      chunks.length = 0;
    }
  };

  return {
    writer: memWriter,
    mode: 'memory',
    warning: undefined
  };
}

import { purgeFailedTransferCache } from './cacheStorage';

/**
 * Detects iOS and iPadOS devices including iPad (iPad 9th gen & below, modern iPadOS, iPhones)
 * where programmatic a.click() on blob URLs without user gesture triggers fatal
 * WebContent process Jetsam crashes.
 */
export function isIOSorIPad(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).platform || '';
  const vendor = navigator.vendor || '';

  // 1. Classic iOS User Agent string (iPhone, iPod, iPad)
  if (/iPad|iPhone|iPod/i.test(ua)) return true;

  // 2. Explicit platform reporting
  if (/iPad|iPhone|iPod/i.test(platform)) return true;

  // 3. iPadOS 13+ desktop mode (reports as MacIntel or Macintosh, but has touch hardware)
  if (platform === 'MacIntel' || platform === 'Macintosh' || /Macintosh/i.test(ua)) {
    // Touch points: iPad always has touch support
    if (navigator.maxTouchPoints > 0) return true;
    // Touch events in window or document
    if ('ontouchstart' in window || ('TouchEvent' in window)) return true;
    // Screen aspect ratio check: iPads (including 9th gen 1080x810 / 1024x768) are 4:3 (~1.33:1 or ~1.43:1)
    // MacBooks are 16:10 (1.6:1) or 16:9 (1.77:1)
    if (typeof screen !== 'undefined') {
      const maxDim = Math.max(screen.width, screen.height);
      const minDim = Math.min(screen.width, screen.height);
      const ratio = maxDim / minDim;
      if (ratio < 1.55) return true;
    }
  }

  // 4. Apple WebKit browser with touch capabilities
  if (/Apple/i.test(vendor) && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window || ('TouchEvent' in window))) {
    return true;
  }

  // 5. iOS standalone PWA mode
  if ((navigator as any).standalone !== undefined) {
    return true;
  }

  return false;
}

/**
 * Triggers safe browser file download from Blob/File.
 * On iPad 9th gen and below (and iOS Safari), unprompted programmatic a.click() on blob URLs
 * is blocked by WebKit security policies and causes the tab to terminate due to out-of-process memory limits.
 * We dispatch a custom event on iOS to allow a safe 1-tap user-gesture save instead.
 */
export function triggerBrowserFileDownload(fileOrBlob: Blob | File, fileName: string): void {
  if (isIOSorIPad()) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexus-ios-download-ready', {
        detail: { blob: fileOrBlob, name: fileName }
      }));
    }
    return;
  }

  try {
    const url = URL.createObjectURL(fileOrBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    }, 20000);
  } catch (err) {
    console.warn("Browser download trigger failed:", err);
  }
}

/**
 * Immediately purges any half-transferred or orphaned temporary chunks
 * from OPFS, IndexedDB, and CacheStorage.
 */
export async function purgeAllTempStorage(targetName?: string): Promise<void> {
  // 1. Clean OPFS temporary files
  if (typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function') {
    try {
      const root = await navigator.storage.getDirectory();
      if ((root as any).values) {
        for await (const entry of (root as any).values()) {
          if (entry.kind === 'file') {
            const name: string = entry.name;
            if (name.startsWith('nexus_temp_') || name.startsWith('transfer-') || (targetName && name.includes(targetName))) {
              try {
                if (typeof entry.remove === 'function') {
                  await entry.remove();
                } else if (typeof root.removeEntry === 'function') {
                  await root.removeEntry(name);
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
  }

  // 2. Clean IndexedDB stream chunks
  if (typeof indexedDB !== 'undefined') {
    try {
      const dbReq = indexedDB.open('nexus_stream_cache', 1);
      dbReq.onsuccess = () => {
        try {
          const db = dbReq.result;
          if (db.objectStoreNames.contains('chunks')) {
            const tx = db.transaction('chunks', 'readwrite');
            const store = tx.objectStore('chunks');
            if (!targetName) {
              store.clear();
            } else {
              const cursorReq = store.openCursor();
              cursorReq.onsuccess = (e: any) => {
                const cursor = e.target.result;
                if (cursor) {
                  if (cursor.key.toString().includes(targetName)) {
                    store.delete(cursor.key);
                  }
                  cursor.continue();
                }
              };
            }
          }
        } catch (_) {}
      };
    } catch (_) {}
  }

  // 3. Clean CacheStorage
  await purgeFailedTransferCache(targetName);
}
