// =============================================================================
// recordings.ts — on-device storage for per-rehearsal camera/mic recordings.
//
// Blobs are far too large for localStorage, so each rehearsal's recording lives
// in IndexedDB keyed by its session id. Everything stays in the user's browser
// — nothing is ever uploaded. Sessions only carry a `hasRecording` flag in
// localStorage; the bytes themselves are fetched from here on demand.
// =============================================================================

export interface RecordingRecord {
  rehearsalId: string;
  blob: Blob;
  mimeType: string;
  duration: number; // seconds, best-effort (excludes paused stretches)
  createdAt: number;
}

const DB_NAME = 'rehearsal-recordings';
const DB_VERSION = 1;
const STORE = 'recordings';

/**
 * IndexedDB can be entirely absent in some private-browsing modes. Callers use
 * this to fall back gracefully ("Recording not supported here") rather than
 * throwing mid-rehearsal.
 */
export function recordingStorageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'rehearsalId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveRecording(rec: RecordingRecord): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getRecording(
  rehearsalId: string,
): Promise<RecordingRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(rehearsalId);
    req.onsuccess = () => resolve((req.result as RecordingRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Grab the first frame of a recording as a small JPEG data URL, used as the
 * card thumbnail / video poster. Downscaled (~320px wide, q0.6) so it stays a
 * few KB and fits comfortably in localStorage alongside the session record.
 *
 * Best-effort: resolves null on any decode/seek failure, and is bounded by a
 * short timeout so a stuck decode never delays the screen transition.
 */
export function captureFirstFrame(blob: Blob): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    let done = false;
    const finish = (result: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(result);
    };
    const grab = () => {
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return finish(null);
        const targetW = Math.min(320, vw);
        const scale = targetW / vw;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.6));
      } catch {
        finish(null);
      }
    };
    const timer = setTimeout(() => finish(null), 1500);
    video.addEventListener('seeked', grab, { once: true });
    video.addEventListener(
      'loadeddata',
      () => {
        // Nudge past 0 — some codecs paint black exactly at t=0.
        try {
          video.currentTime = 0.1;
        } catch {
          grab();
        }
      },
      { once: true },
    );
    video.addEventListener('error', () => finish(null), { once: true });
    video.src = url;
  });
}

/** Best-effort cleanup — used when a talk (and its rehearsals) is deleted. */
export async function deleteRecording(rehearsalId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(rehearsalId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Wipe EVERY recording from the store, app-wide (the "Delete all recordings"
 * safety valve). Only the in-browser copies are removed — files the user has
 * in their Downloads folder are outside our reach and untouched.
 */
export async function clearAllRecordings(): Promise<void> {
  if (!recordingStorageAvailable()) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Save a copy of the recording to the user's Downloads folder via a synthetic
 * anchor click. This is the "A copy is in your Downloads folder" half of the
 * storage notice — a local file, never an upload. Best-effort and silent.
 */
export function downloadRecording(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after a tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    console.warn('Could not download recording copy', e);
  }
}

// --- one-time "your recording is saved" notice ------------------------------
const STORAGE_NOTICE_KEY = 'rehearsal.hasSeenStorageNotice';

export function hasSeenStorageNotice(): boolean {
  try {
    return localStorage.getItem(STORAGE_NOTICE_KEY) === 'true';
  } catch {
    return true; // if we can't read it, don't nag
  }
}

export function markStorageNoticeSeen(): void {
  try {
    localStorage.setItem(STORAGE_NOTICE_KEY, 'true');
  } catch {
    /* ignore */
  }
}
