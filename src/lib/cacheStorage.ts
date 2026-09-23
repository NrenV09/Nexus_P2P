/**
 * CacheStorage API Manager for File Drop Zone Sandbox
 * 
 * Implements persistent disk caching for sending, storing, reading,
 * and deleting files across browser sessions using window.caches.
 */

export const CACHE_NAME = 'app-cache-v1';

/**
 * Checks cache first. If missing, fetches from network, stores in cache, and returns Blob URL.
 */
export async function getOrStoreCache(url: string, mimeType: string): Promise<string> {
  if (typeof window === 'undefined' || !window.caches) {
    // Fallback if CacheStorage is not available in environment
    const res = await fetch(url);
    const b = await res.blob();
    return URL.createObjectURL(new Blob([b], { type: mimeType }));
  }

  const cache = await window.caches.open(CACHE_NAME);
  
  // 1. Check if already stored
  let response = await cache.match(url);
  
  // 2. If not stored, fetch from server and save to cache
  if (!response) {
    const networkResponse = await fetch(url);
    if (!networkResponse.ok) throw new Error(`Fetch failed: ${networkResponse.statusText}`);
    
    // Store a clone (body stream can only be read once)
    await cache.put(url, networkResponse.clone());
    response = networkResponse;
  }
  
  // 3. Convert to Blob URL for runtime execution
  const blob = await response.blob();
  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}

/**
 * Removes a specific URL/file from the cache.
 */
export async function deleteCachedFile(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || !window.caches) return false;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const wasDeleted = await cache.delete(url);
    return wasDeleted; // true if found and removed, false if not found
  } catch (err) {
    console.warn("deleteCachedFile error:", err);
    return false;
  }
}

/**
 * Deletes the entire cache bucket and all stored binaries/files.
 */
export async function clearAllCache(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.caches) return false;
  try {
    return await window.caches.delete(CACHE_NAME);
  } catch (err) {
    console.warn("clearAllCache error:", err);
    return false;
  }
}

/**
 * Calculates the total disk space used by your cached files in MB.
 */
export async function getCacheSizeMB(): Promise<number> {
  if (typeof window === 'undefined' || !window.caches) return 0;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let totalBytes = 0;

    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalBytes += blob.size;
      }
    }

    return Number((totalBytes / (1024 * 1024)).toFixed(2));
  } catch (err) {
    console.warn("getCacheSizeMB error:", err);
    return 0;
  }
}

/**
 * Helper: Stores a file/blob directly into the CacheStorage sandbox bucket
 * and returns the cached URL key and a runtime Blob URL.
 */
export async function storeFileInSandboxCache(
  fileId: string,
  name: string,
  blobOrFile: Blob | File,
  mimeType: string,
  extraMetadata?: Record<string, string>
): Promise<{ cacheUrl: string; blobUrl: string }> {
  const safeName = encodeURIComponent(name);
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.local';
  const cacheUrl = `${origin}/sandbox-cache/${fileId}/${safeName}`;

  // Store in CacheStorage if under 25MB to prevent quota exceptions
  if (typeof window !== 'undefined' && window.caches && blobOrFile.size < 25 * 1024 * 1024) {
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const headers = new Headers();
      headers.set('Content-Type', mimeType || blobOrFile.type || 'application/octet-stream');
      headers.set('Content-Length', blobOrFile.size.toString());
      headers.set('X-Sandbox-File-Id', fileId);
      headers.set('X-Sandbox-File-Name', encodeURIComponent(name));
      headers.set('X-Sandbox-Date', new Date().toISOString());

      if (extraMetadata) {
        for (const [k, v] of Object.entries(extraMetadata)) {
          headers.set(`X-Sandbox-${k}`, encodeURIComponent(v));
        }
      }

      const response = new Response(blobOrFile, { headers });
      await cache.put(cacheUrl, response);
    } catch (e) {
      console.warn("storeFileInSandboxCache quota notice:", e);
    }
  }

  // Generate runtime Blob URL directly from source to avoid double-allocation and 404 network fetches
  const blobUrl = URL.createObjectURL(blobOrFile);

  return { cacheUrl, blobUrl };
}

/**
 * Helper: Retrieves a Blob directly from the cache bucket for a given cache URL.
 */
export async function getCachedBlob(cacheUrl: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !window.caches) return null;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const response = await cache.match(cacheUrl);
    if (!response) return null;
    return await response.blob();
  } catch (err) {
    console.warn("getCachedBlob error:", err);
    return null;
  }
}
