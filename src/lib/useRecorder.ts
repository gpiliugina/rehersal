// =============================================================================
// useRecorder.ts — camera/mic capture for a rehearsal, saved to IndexedDB.
//
// Wraps getUserMedia + MediaRecorder. The hook owns the stream and recorder
// lifecycle and releases the camera/mic when the consuming component unmounts,
// so we never leave the indicator light on in the background.
//
// Recording is always OPTIONAL — every failure path (denied, busy, no support)
// resolves to "no recording this time" and the rehearsal proceeds untouched.
// The real audio is never analysed; audience reactions stay scripted.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  captureFirstFrame,
  downloadRecording,
  recordingStorageAvailable,
  saveRecording,
} from './recordings';

// Filename for the Downloads-folder copy: rehearsal-YYYYMMDD-HHMMSS.webm.
function downloadFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `rehearsal-${stamp}.webm`;
}

export type RecorderStatus =
  | 'idle' // nothing decided yet
  | 'requesting' // awaiting getUserMedia
  | 'ready' // permission granted, stream live, not yet recording
  | 'recording'
  | 'paused'
  | 'denied' // user or browser blocked access
  | 'busy' // device in use by another app
  | 'skipped' // user chose to skip recording
  | 'unsupported'; // no MediaRecorder / IndexedDB here

export type RecordingDecision = 'granted' | 'denied' | 'skipped';

// Remembered for the lifetime of the page so re-entering Rehearsing doesn't
// re-prompt after the user has already chosen once (allow / deny / skip).
let sessionDecision: RecordingDecision | null = null;
export function getRecordingDecision(): RecordingDecision | null {
  return sessionDecision;
}

function pickMimeType(): string {
  const prefs = ['video/webm;codecs=vp9,opus', 'video/webm'];
  for (const t of prefs) {
    if (
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(t)
    ) {
      return t;
    }
  }
  return 'video/webm';
}

export function useRecorder() {
  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    recordingStorageAvailable();

  const [status, setStatus] = useState<RecorderStatus>(
    supported ? 'idle' : 'unsupported',
  );

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('video/webm');
  // Accumulated recorded time, excluding paused stretches. performance.now()
  // marks the start of the current live segment.
  const segmentStartRef = useRef<number>(0);
  const recordedMsRef = useRef<number>(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Safety net: release camera/mic when the consumer unmounts (End, cancel,
  // or any navigation away from Rehearsing).
  useEffect(
    () => () => {
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      stopStream();
    },
    [stopStream],
  );

  /** Prompt for / acquire camera + mic. Returns true on success. */
  const requestAccess = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      setStatus('unsupported');
      return false;
    }
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      mimeRef.current = pickMimeType();
      sessionDecision = 'granted';
      setStatus('ready');
      return true;
    } catch (err) {
      const name = (err as DOMException)?.name;
      // Device held by another app surfaces as a hardware error — recoverable,
      // so we don't mark it as a permanent "denied" decision.
      if (
        name === 'NotReadableError' ||
        name === 'TrackStartError' ||
        name === 'AbortError'
      ) {
        setStatus('busy');
      } else {
        sessionDecision = 'denied';
        setStatus('denied');
      }
      return false;
    }
  }, [supported]);

  /** User declined recording for this session (no prompt). */
  const skip = useCallback(() => {
    sessionDecision = 'skipped';
    setStatus('skipped');
  }, []);

  /** Begin recording from the live stream. No-op if no stream is ready. */
  const start = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mimeRef.current });
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        return;
      }
    }
    chunksRef.current = [];
    recordedMsRef.current = 0;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = rec;
    // Timeslice so we get periodic chunks rather than one giant blob at stop —
    // keeps memory steady on longer rehearsals.
    rec.start(1000);
    segmentStartRef.current = performance.now();
    setStatus('recording');
  }, []);

  const pause = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') {
      rec.pause();
      recordedMsRef.current += performance.now() - segmentStartRef.current;
      setStatus('paused');
    }
  }, []);

  const resume = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === 'paused') {
      rec.resume();
      segmentStartRef.current = performance.now();
      setStatus('recording');
    }
  }, []);

  /**
   * Stop recording, save the blob to IndexedDB under `rehearsalId`, capture a
   * first-frame poster, and release the camera/mic. Returns whether a non-empty
   * recording was stored plus the poster data URL (null if unavailable).
   */
  const stopAndSave = useCallback(
    async (
      rehearsalId: string,
    ): Promise<{ saved: boolean; poster: string | null }> => {
      const rec = recorderRef.current;
      if (!rec || rec.state === 'inactive') {
        stopStream();
        return { saved: false, poster: null };
      }
      if (rec.state === 'recording') {
        recordedMsRef.current += performance.now() - segmentStartRef.current;
      }
      const mime = mimeRef.current;
      const blob = await new Promise<Blob>((resolve) => {
        rec.onstop = () =>
          resolve(new Blob(chunksRef.current, { type: mime }));
        try {
          rec.stop();
        } catch {
          resolve(new Blob(chunksRef.current, { type: mime }));
        }
      });
      stopStream();
      recorderRef.current = null;
      setStatus('idle');
      if (blob.size === 0) return { saved: false, poster: null };
      const poster = await captureFirstFrame(blob);
      // Drop a copy in the user's Downloads folder (local file, not an upload).
      downloadRecording(blob, downloadFilename());
      try {
        await saveRecording({
          rehearsalId,
          blob,
          mimeType: mime,
          duration: recordedMsRef.current / 1000,
          createdAt: Date.now(),
        });
        return { saved: true, poster };
      } catch (e) {
        console.warn('Failed to save rehearsal recording', e);
        return { saved: false, poster: null };
      }
    },
    [stopStream],
  );

  /**
   * The live capture stream (camera+mic), or null before access is granted /
   * after teardown. Exposed so live voice-analysis can TAP the same mic stream
   * (via a Web Audio MediaStreamSource) — never re-requesting the device.
   */
  const getStream = useCallback(() => streamRef.current, []);

  /** Tear down without saving — used when a rehearsal is cancelled. */
  const discard = useCallback(() => {
    const rec = recorderRef.current;
    try {
      if (rec && rec.state !== 'inactive') rec.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopStream();
  }, [stopStream]);

  return {
    status,
    supported,
    requestAccess,
    skip,
    start,
    pause,
    resume,
    stopAndSave,
    discard,
    getStream,
  };
}
