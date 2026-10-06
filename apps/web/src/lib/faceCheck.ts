'use client';

import type { FaceDetector } from '@mediapipe/tasks-vision';

/**
 * On-device face check (MediaPipe BlazeFace): is a face visible in my camera?
 * Used before matching and as a gentle reminder during calls. Nothing leaves
 * the device. Fails open: if the detector can't load, callers carry on.
 */

const VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';

let detectorPromise: Promise<FaceDetector> | null = null;
function loadDetector(): Promise<FaceDetector> {
  detectorPromise ??= (async () => {
    const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const make = (delegate: 'GPU' | 'CPU') =>
      FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
    return make('GPU').catch(() => make('CPU'));
  })().catch((e) => {
    detectorPromise = null;
    throw e;
  });
  return detectorPromise;
}

/** A hidden video element showing `stream`, for sampling frames. */
const probes = new WeakMap<MediaStream, HTMLVideoElement>();
async function probeFor(stream: MediaStream): Promise<HTMLVideoElement> {
  let v = probes.get(stream);
  if (!v) {
    v = Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    v.srcObject = stream;
    probes.set(stream, v);
  }
  if (v.paused) await v.play().catch(() => undefined);
  if (v.readyState < 2) await new Promise((r) => v!.addEventListener('loadeddata', r, { once: true }));
  return v;
}

/** true / false, or null when the check can't run (treat as "fine"). */
export async function faceVisible(stream: MediaStream): Promise<boolean | null> {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live' || !track.enabled) return null;
  try {
    const [detector, video] = await Promise.all([loadDetector(), probeFor(stream)]);
    return detector.detect(video).detections.length > 0;
  } catch {
    return null;
  }
}

/** Looks for a face for up to `ms`; resolves as soon as one is seen. */
export async function waitForFace(stream: MediaStream, ms = 6_000, signal?: AbortSignal): Promise<boolean | null> {
  const end = Date.now() + ms;
  let last: boolean | null = null;
  while (Date.now() < end && !signal?.aborted) {
    last = await faceVisible(stream);
    if (last !== false) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  return last;
}
