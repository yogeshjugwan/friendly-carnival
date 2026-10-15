'use client';

import type { FaceLandmarker } from '@mediapipe/tasks-vision';

/**
 * Animated face masks (Animoji-style) for the outgoing camera. MediaPipe's face
 * landmarker tracks the face in each frame; we draw a cartoon head over it that
 * follows position, size and tilt, blinks with your eyes and opens its mouth
 * when you talk. Runs in the browser; no video leaves the device for this.
 */

export type MaskKind = 'none' | 'monkey' | 'bear' | 'cat' | 'panda' | 'fox' | 'alien';

export const MASK_OPTIONS: { kind: MaskKind; label: string; emoji: string }[] = [
  { kind: 'none', label: 'No mask', emoji: '⊘' },
  { kind: 'monkey', label: 'Monkey', emoji: '🐵' },
  { kind: 'bear', label: 'Bear', emoji: '🐻' },
  { kind: 'cat', label: 'Cat', emoji: '🐱' },
  { kind: 'panda', label: 'Panda', emoji: '🐼' },
  { kind: 'fox', label: 'Fox', emoji: '🦊' },
  { kind: 'alien', label: 'Alien', emoji: '👽' },
];

const VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

/** Loads the face landmarker once (~3.6 MB model), GPU when available. */
export function loadLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const make = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    return make('GPU').catch(() => make('CPU'));
  })().catch((e) => {
    landmarkerPromise = null;
    throw e;
  });
  return landmarkerPromise;
}

/** Where the face is and what it's doing, smoothed between frames. */
export interface FacePose {
  x: number;
  y: number;
  size: number;
  roll: number;
  blinkL: number;
  blinkR: number;
  jaw: number;
  smile: number;
}

type P = { x: number; y: number };

/** Reads one frame's landmarks into a pose (pixel units of a w×h canvas). */
export function poseFrom(landmarks: P[], shapes: { categoryName: string; score: number }[] | undefined, w: number, h: number): FacePose {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Outer eye corners (33 = one side, 263 = the other) give the head tilt.
  const a = landmarks[33]!;
  const b = landmarks[263]!;
  const s = (name: string) => shapes?.find((c) => c.categoryName === name)?.score ?? 0;
  return {
    x: ((minX + maxX) / 2) * w,
    y: ((minY + maxY) / 2) * h,
    size: Math.max((maxX - minX) * w, (maxY - minY) * h),
    roll: Math.atan2((b.y - a.y) * h, (b.x - a.x) * w),
    blinkL: s('eyeBlinkLeft'),
    blinkR: s('eyeBlinkRight'),
    jaw: s('jawOpen'),
    smile: (s('mouthSmileLeft') + s('mouthSmileRight')) / 2,
  };
}

/** Eases the previous pose toward the new one so the mask doesn't jitter. */
export function smooth(prev: FacePose | null, next: FacePose, k = 0.5): FacePose {
  if (!prev) return next;
  const m = (a: number, b: number) => a + (b - a) * k;
  return {
    x: m(prev.x, next.x),
    y: m(prev.y, next.y),
    size: m(prev.size, next.size),
    roll: m(prev.roll, next.roll),
    blinkL: next.blinkL,
    blinkR: next.blinkR,
    jaw: m(prev.jaw, next.jaw),
    smile: m(prev.smile, next.smile),
  };
}

interface Look {
  head: string;
  face: string;
  ear: string;
  inner: string;
  nose: string;
  ears: 'round' | 'side' | 'pointy' | 'none';
  patches?: string;
}

const LOOKS: Record<Exclude<MaskKind, 'none'>, Look> = {
  monkey: { head: '#9b6b3e', face: '#f1d3a8', ear: '#9b6b3e', inner: '#f2a7b0', nose: '#5a3a22', ears: 'side' },
  bear: { head: '#8b5a2b', face: '#d9a873', ear: '#8b5a2b', inner: '#d9a873', nose: '#2b1a10', ears: 'round' },
  cat: { head: '#f2a65a', face: '#fde2c4', ear: '#f2a65a', inner: '#f7b6c2', nose: '#e86f8a', ears: 'pointy' },
  panda: { head: '#f5f5f5', face: '#ffffff', ear: '#1b1b1b', inner: '#1b1b1b', nose: '#1b1b1b', ears: 'round', patches: '#1b1b1b' },
  fox: { head: '#e8742c', face: '#fff3e6', ear: '#e8742c', inner: '#3a2216', nose: '#1b1b1b', ears: 'pointy' },
  alien: { head: '#7ed957', face: '#9fe57d', ear: '#7ed957', inner: '#7ed957', nose: '#4f9a35', ears: 'none' },
};

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Draws `kind` over the face described by `pose`. */
export function drawMask(ctx: CanvasRenderingContext2D, kind: MaskKind, pose: FacePose) {
  if (kind === 'none') return;
  const look = LOOKS[kind];
  const r = pose.size * 0.62; // head radius: a bit bigger than the face so it covers it
  ctx.save();
  ctx.translate(pose.x, pose.y - r * 0.05);
  ctx.rotate(pose.roll);
  ctx.shadowColor = 'rgba(0,0,0,.25)';
  ctx.shadowBlur = r * 0.08;

  // Ears behind the head.
  if (look.ears === 'side') {
    for (const s of [-1, 1]) {
      ellipse(ctx, s * r * 0.98, r * 0.05, r * 0.32, r * 0.36, look.ear);
      ellipse(ctx, s * r * 0.98, r * 0.05, r * 0.19, r * 0.23, look.inner);
    }
  } else if (look.ears === 'round') {
    for (const s of [-1, 1]) {
      ellipse(ctx, s * r * 0.68, -r * 0.78, r * 0.3, r * 0.3, look.ear);
      ellipse(ctx, s * r * 0.68, -r * 0.78, r * 0.16, r * 0.16, look.inner);
    }
  } else if (look.ears === 'pointy') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.25, -r * 0.82);
      ctx.lineTo(s * r * 0.8, -r * 1.25);
      ctx.lineTo(s * r * 0.9, -r * 0.4);
      ctx.closePath();
      ctx.fillStyle = look.ear;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * r * 0.4, -r * 0.78);
      ctx.lineTo(s * r * 0.75, -r * 1.08);
      ctx.lineTo(s * r * 0.8, -r * 0.55);
      ctx.closePath();
      ctx.fillStyle = look.inner;
      ctx.fill();
    }
  } else {
    // Alien: antennae.
    for (const s of [-1, 1]) {
      ctx.strokeStyle = look.head;
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(s * r * 0.3, -r * 0.85);
      ctx.lineTo(s * r * 0.55, -r * 1.3);
      ctx.stroke();
      ellipse(ctx, s * r * 0.55, -r * 1.32, r * 0.09, r * 0.09, look.nose);
    }
  }

  // Head.
  ellipse(ctx, 0, 0, r, r * (kind === 'alien' ? 1.12 : 0.98), look.head);
  ctx.shadowBlur = 0;

  // Face area (monkey's heart-shaped face, muzzles for the others).
  if (kind === 'monkey') {
    ellipse(ctx, -r * 0.3, -r * 0.18, r * 0.36, r * 0.38, look.face);
    ellipse(ctx, r * 0.3, -r * 0.18, r * 0.36, r * 0.38, look.face);
    ellipse(ctx, 0, r * 0.33, r * 0.62, r * 0.44, look.face);
  } else if (kind !== 'alien') {
    ellipse(ctx, 0, r * 0.35, r * 0.5, r * 0.36, look.face);
  }

  // Eyes (closing with your blinks). Mirror-aware: left on the canvas is the person's right.
  const eyeY = -r * 0.15;
  const eyeX = r * 0.32;
  const eyeR = kind === 'alien' ? r * 0.2 : r * 0.12;
  for (const [s, blink] of [
    [-1, pose.blinkR],
    [1, pose.blinkL],
  ] as const) {
    if (look.patches) ellipse(ctx, s * eyeX, eyeY, r * 0.22, r * 0.28, look.patches);
    const open = Math.max(0.08, 1 - Math.min(1, blink * 1.4));
    ellipse(ctx, s * eyeX, eyeY, eyeR, eyeR * open * (kind === 'alien' ? 1.3 : 1), kind === 'alien' ? '#111' : '#fff');
    if (kind !== 'alien' && open > 0.3) {
      ellipse(ctx, s * eyeX, eyeY + eyeR * 0.1, eyeR * 0.55, eyeR * 0.55 * open, '#1b1b1b');
      ellipse(ctx, s * eyeX + eyeR * 0.2, eyeY - eyeR * 0.15, eyeR * 0.18, eyeR * 0.18 * open, '#fff');
    }
  }

  // Nose.
  if (kind === 'monkey') {
    ellipse(ctx, -r * 0.07, r * 0.2, r * 0.04, r * 0.035, look.nose);
    ellipse(ctx, r * 0.07, r * 0.2, r * 0.04, r * 0.035, look.nose);
  } else if (kind !== 'alien') {
    ellipse(ctx, 0, r * 0.2, r * 0.11, r * 0.08, look.nose);
  }

  // Mouth: opens with your jaw, widens when you smile.
  const open = Math.min(1, pose.jaw * 1.6);
  const width = r * (0.22 + pose.smile * 0.15);
  const mouthY = r * 0.48;
  if (open > 0.12) {
    ellipse(ctx, 0, mouthY, width, r * 0.05 + open * r * 0.22, '#3b0d12');
    ellipse(ctx, 0, mouthY + open * r * 0.12, width * 0.6, open * r * 0.08, '#e86f8a');
    ctx.fillStyle = '#fff';
    ctx.fillRect(-width * 0.7, mouthY - (r * 0.05 + open * r * 0.22) + 1, width * 1.4, r * 0.05);
  } else {
    ctx.strokeStyle = '#3b0d12';
    ctx.lineWidth = r * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, mouthY - r * 0.1, width, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}
