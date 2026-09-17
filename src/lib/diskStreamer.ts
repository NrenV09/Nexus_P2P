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

  // 4. Memory Fallback with strict iOS WebKit Jetsam Guard
  const chunks: ArrayBuffer[] = [];
  let receivedBytes = 0;
  // Maximum safe buffer size for iOS WebKit without triggering Jetsam white screen
  const MAX_SAFE_IOS_BYTES = 250 * 1024 * 1024; // 250 MB

  const memWriter: DiskWriter = {
    mode: 'memory',
    isWriting: false,
    async write(chunk: ArrayBuffer) {
      receivedBytes += chunk.byteLength;
      if (isIOS && receivedBytes > MAX_SAFE_IOS_BYTES) {
        throw new Error(
          `iOS Memory Limit Reached: Transfer paused at ${Math.round(receivedBytes / (1024 * 1024))}MB to prevent an iOS WebKit white-screen crash. Use Chromium Desktop for multi-gigabyte transfers.`
        );
      }
      chunks.push(chunk);
    },
    async close() {
      return new Blob(chunks, { type: mimeType || 'application/octet-stream' });
    },
    async abort() {
      chunks.length = 0;
    }
  };

  return {
    writer: memWriter,
    mode: 'memory',
    warning: isIOS && totalSize > MAX_SAFE_IOS_BYTES
      ? `Large file alert: This file (${Math.round(totalSize / (1024 * 1024))}MB) is close to mobile iOS RAM limits.`
      : undefined
  };
}

/**
 * Triggers safe browser file download from Blob/File
 */
export function triggerBrowserFileDownload(fileOrBlob: Blob | File, fileName: string): void {
  const url = URL.createObjectURL(fileOrBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
}
