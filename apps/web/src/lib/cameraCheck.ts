'use client';

/**
 * Is the camera picture usable? Catches a black camera (off, covered lens,
 * dark room), a covered lens (one flat colour) and a badly blurred picture,
 * on this device, from a few small frames. Fails open (null) if it can't look.
 */
export type CameraProblem = 'dark' | 'covered' | 'blurry';

export interface FrameStats {
  /** Average brightness 0–255. */
  mean: number;
  /** Brightness spread (standard deviation). */
  spread: number;
  /** Average edge strength (absolute Laplacian); low means blurry. */
  sharpness: number;
}

/**
 * Frames are shrunk in two steps (to 160×120, then 40×30) so camera grain
 * averages out while real edges survive. Measured on photos at 640×480:
 * sharp scenes score 40–75, a heavy blur (unrecognisable face) 4–10, and
 * sensor noise changes that by about 1.
 */
const W = 40;
const H = 30;
export const LIMITS = { dark: 22, flat: 7, blurry: 8 } as const;

export function frameStats(rgba: Uint8ClampedArray, w = W, h = H): FrameStats {
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const g = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    gray[i] = g;
    sum += g;
  }
  const mean = sum / (w * h);
  let sq = 0;
  for (let i = 0; i < w * h; i++) sq += (gray[i]! - mean) ** 2;
  let lap = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      lap += Math.abs(4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - w]! - gray[i + w]!);
      n++;
    }
  }
  return { mean, spread: Math.sqrt(sq / (w * h)), sharpness: lap / n };
}

export function problemOf(s: FrameStats): CameraProblem | null {
  if (s.mean < LIMITS.dark) return 'dark';
  if (s.spread < LIMITS.flat) return 'covered';
  if (s.sharpness < LIMITS.blurry) return 'blurry';
  return null;
}

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

let mid: HTMLCanvasElement | null = null;
let small: HTMLCanvasElement | null = null;

/** Stats of the current frame, or null when the camera isn't readable. */
export async function sampleFrame(stream: MediaStream): Promise<FrameStats | null> {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live' || !track.enabled) return null;
  try {
    const video = await Promise.race([probeFor(stream), new Promise<null>((r) => setTimeout(() => r(null), 3_000))]);
    if (!video) return null;
    mid ??= Object.assign(document.createElement('canvas'), { width: 160, height: 120 });
    small ??= Object.assign(document.createElement('canvas'), { width: W, height: H });
    const m = mid.getContext('2d');
    const ctx = small.getContext('2d', { willReadFrequently: true });
    if (!m || !ctx) return null;
    m.drawImage(video, 0, 0, 160, 120);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mid, 0, 0, W, H);
    return frameStats(ctx.getImageData(0, 0, W, H).data);
  } catch {
    return null;
  }
}

/**
 * Looks at 3 frames over ~1 s; reports a problem only when every frame has it
 * (a camera that's still adjusting its exposure isn't failed). null = can't tell.
 */
export async function checkCamera(stream: MediaStream): Promise<CameraProblem | 'ok' | null> {
  const found: (CameraProblem | null)[] = [];
  for (let i = 0; i < 3; i++) {
    const s = await sampleFrame(stream);
    if (!s) return null;
    found.push(problemOf(s));
    if (!found[i]) return 'ok';
    if (i < 2) await new Promise((r) => setTimeout(r, 400));
  }
  return found.every((p) => p === found[0]) ? found[0]! : found[found.length - 1]!;
}

/** Why the camera can't be used, and how to fix it. */
export const CAMERA_PROBLEM = {
  dark: {
    title: 'Your camera is black',
    help: 'Is the camera turned on, uncovered and not used by another app? If it is, turn on a light or face a window.',
    chip: '📷 Your camera is black — check it is uncovered and the room has light',
  },
  covered: {
    title: 'Your camera looks covered',
    help: 'We only see one flat colour. Remove any cover, sticker or finger from the lens, then try again.',
    chip: '📷 Your camera looks covered — uncover the lens',
  },
  blurry: {
    title: 'Your camera is too blurry',
    help: 'Wipe the lens and hold still, or move a little further from the camera so it can focus.',
    chip: '📷 Your camera is very blurry — wipe the lens',
  },
} as const;
