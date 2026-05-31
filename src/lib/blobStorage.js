// Persist a single pending photo Blob across WebView resets (Android
// Chrome / iOS Safari PWA). IndexedDB is the only sane choice — Blobs
// aren't safely serialisable to sessionStorage, and localStorage has a
// ~5MB cap and only stores strings.
//
// All ops are best-effort: errors are logged and the call returns
// null/false rather than throwing. Callers should treat persistence as
// a recoverable bonus, not a hard guarantee.

const DB_NAME = 'athletigo-blob-storage';
const DB_VERSION = 1;
const STORE_NAME = 'pending-photos';
const PHOTO_KEY = 'pending-photo-blob';
// Reject persisted blobs older than this — anything longer is almost
// certainly a stale entry from a previous session, not a live
// WebView-reload recovery.
const TTL_MS = 30 * 60 * 1000;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
  });
}

export async function savePendingBlob(blob, filename = 'photo.jpg') {
  try {
    if (!blob || typeof blob.arrayBuffer !== 'function') return false;
    const buffer = await blob.arrayBuffer();
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        buffer,
        type: blob.type || 'image/jpeg',
        size: blob.size,
        filename,
        savedAt: Date.now(),
      }, PHOTO_KEY);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.warn('[blobStorage] savePendingBlob failed:', err);
    return false;
  }
}

export async function loadPendingBlob() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(PHOTO_KEY);
      req.onsuccess = () => {
        const rec = req.result;
        db.close();
        if (!rec || !rec.buffer) { resolve(null); return; }
        if (rec.savedAt && (Date.now() - rec.savedAt) > TTL_MS) {
          // Stale — older than the recovery window. Treat as absent.
          resolve(null);
          return;
        }
        try {
          const blob = new Blob([rec.buffer], { type: rec.type || 'image/jpeg' });
          resolve({ blob, filename: rec.filename || 'photo.jpg', savedAt: rec.savedAt });
        } catch (e) {
          resolve(null);
        }
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (err) {
    console.warn('[blobStorage] loadPendingBlob failed:', err);
    return null;
  }
}

export async function clearPendingBlob() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(PHOTO_KEY);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.warn('[blobStorage] clearPendingBlob failed:', err);
    return false;
  }
}
