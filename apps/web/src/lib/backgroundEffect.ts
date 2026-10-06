'use client';

import type { ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * Background blur / virtual backgrounds for the outgoing camera, like Meet's
 * "Backgrounds and effects". MediaPipe's selfie segmenter finds the person in
 * each frame; we draw the background (blurred camera, or a picture) and the
 * person on top into a canvas, and send the canvas as the video track.
 * Everything runs in the browser; no video leaves the device for this.
 */

export type BackgroundMode = 'none' | 'slight-blur' | 'blur' | 'sunset' | 'ocean' | 'night' | 'forest';

export const BACKGROUND_OPTIONS: { mode: BackgroundMode; label: string; swatch: string }[] = [
  { mode: 'none', label: 'No effect', swatch: 'transparent' },
  { mode: 'slight-blur', label: 'Slightly blur', swatch: 'transparent' },
  { mode: 'blur', label: 'Blur', swatch: 'transparent' },
  { mode: 'sunset', label: 'Sunset', swatch: 'linear-gradient(160deg,#ff9a8b,#ff6a88 45%,#ff99ac)' },
  { mode: 'ocean', label: 'Ocean', swatch: 'linear-gradient(160deg,#2193b0,#6dd5ed)' },
  { mode: 'night', label: 'Night sky', swatch: 'linear-gradient(160deg,#0f2027,#203a43 50%,#2c5364)' },
  { mode: 'forest', label: 'Forest', swatch: 'linear-gradient(160deg,#134e5e,#71b280)' },
];

const VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const FPS = 24;

let segmenterPromise: Promise<ImageSegmenter> | null = null;

/** Loads the segmenter once (wasm + ~250 KB model), GPU when available. */
function loadSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const make = (delegate: 'GPU' | 'CPU') =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    return make('GPU').catch(() => make('CPU'));
  })().catch((e) => {
    segmenterPromise = null; // allow a retry later
    throw e;
  });
  return segmenterPromise;
}

export function backgroundEffectsSupported(): boolean {
  return typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

function paintVirtual(ctx: CanvasRenderingContext2D, mode: BackgroundMode, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  const stops: Record<string, string[]> = {
    sunset: ['#ff9a8b', '#ff6a88', '#ff99ac'],
    ocean: ['#2193b0', '#4fb3d9', '#6dd5ed'],
    night: ['#0f2027', '#203a43', '#2c5364'],
    forest: ['#134e5e', '#3f8f6f', '#71b280'],
  };
  const [a, b, c] = stops[mode] ?? stops.ocean;
  g.addColorStop(0, a);
  g.addColorStop(0.5, b);
  g.addColorStop(1, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (mode === 'night') {
    // A few stars.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 60; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 12345.678) % 1;
      ctx.fillRect(Math.abs(x) * w, Math.abs(y) * h * 0.7, 2, 2);
    }
  }
}

export class BackgroundEffect {
  private video = document.createElement('video');
  private out = document.createElement('canvas');
  private person = document.createElement('canvas');
  private mask = document.createElement('canvas');
  private stream: MediaStream | null = null;
  private timer: number | null = null;
  private stopped = false;
  private segmenter: ImageSegmenter | null = null;
  private maskData: ImageData | null = null;

  constructor(private mode: BackgroundMode) {
    this.video.muted = true;
    this.video.playsInline = true;
  }

  /** Starts processing `input`; resolves with the processed video track. */
  async start(input: MediaStreamTrack): Promise<MediaStreamTrack> {
    this.segmenter = await loadSegmenter();
    await this.setInput(input);
    this.stream = this.out.captureStream(FPS);
    this.loop();
    return this.stream.getVideoTracks()[0];
  }

  /** Switch cameras without restarting the effect. */
  async setInput(input: MediaStreamTrack) {
    this.video.srcObject = new MediaStream([input]);
    await this.video.play().catch(() => undefined);
    const { width = 640, height = 480 } = input.getSettings();
    for (const c of [this.out, this.person]) {
      c.width = width;
      c.height = height;
    }
  }

  setMode(mode: BackgroundMode) {
    this.mode = mode;
  }

  private loop = () => {
    if (this.stopped) return;
    // setTimeout rather than requestAnimationFrame so frames keep coming while
    // the tab is in the background (browsers slow timers there, but don't stop them).
    this.timer = window.setTimeout(this.loop, 1000 / FPS);
    try {
      this.frame();
    } catch {
      /* skip a bad frame */
    }
  };

  private frame() {
    const { video, out, person, mask, segmenter } = this;
    if (!segmenter || video.readyState < 2 || !out.width) return;
    const w = out.width;
    const h = out.height;
    const ctx = out.getContext('2d')!;

    const result = segmenter.segmentForVideo(video, performance.now());
    const conf = result.confidenceMasks?.[0];
    if (!conf) {
      ctx.drawImage(video, 0, 0, w, h);
      result.close();
      return;
    }

    // Person mask → alpha channel of a small canvas.
    const values = conf.getAsFloat32Array();
    if (mask.width !== conf.width || mask.height !== conf.height || !this.maskData) {
      mask.width = conf.width;
      mask.height = conf.height;
      this.maskData = new ImageData(conf.width, conf.height);
    }
    const px = this.maskData.data;
    for (let i = 0; i < values.length; i++) px[i * 4 + 3] = values[i] * 255;
    mask.getContext('2d')!.putImageData(this.maskData, 0, 0);
    result.close();

    // Person layer: the camera, kept only where the mask says "person".
    const p = person.getContext('2d')!;
    p.globalCompositeOperation = 'copy';
    p.filter = 'none';
    p.drawImage(video, 0, 0, w, h);
    p.globalCompositeOperation = 'destination-in';
    p.filter = 'blur(2px)'; // soften the edge
    p.drawImage(mask, 0, 0, w, h);
    p.globalCompositeOperation = 'source-over';
    p.filter = 'none';

    // Background, then the person on top.
    ctx.globalCompositeOperation = 'source-over';
    if (this.mode === 'blur' || this.mode === 'slight-blur') {
      ctx.filter = `blur(${this.mode === 'blur' ? 14 : 6}px)`;
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = 'none';
    } else {
      paintVirtual(ctx, this.mode, w, h);
    }
    ctx.drawImage(person, 0, 0, w, h);
  }

  /** Stops processing (the input camera track is left running for the caller). */
  stop() {
    this.stopped = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }
}
