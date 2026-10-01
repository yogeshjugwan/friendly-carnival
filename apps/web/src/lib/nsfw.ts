'use client';

import { MAX_SNAPSHOT_BYTES } from '@rc/shared';
import type { NSFWJS } from 'nsfwjs/core';

let modelPromise: Promise<NSFWJS> | null = null;

/** Static MobileNetV2 model, written to public/ by scripts/extract-nsfw-model.cjs. */
const MODEL_URL = '/models/nsfw/model.json';

/** Loads TensorFlow.js and the small MobileNetV2 model (~2.6 MB) on first use only. */
export function loadNsfwModel(): Promise<NSFWJS> {
  modelPromise ??= (async () => {
    const [tf, { load }] = await Promise.all([import('@tensorflow/tfjs'), import('nsfwjs/core')]);
    tf.enableProdMode();
    await tf.ready();
    return load(MODEL_URL);
  })().catch((e) => {
    modelPromise = null; // allow a retry on the next call
    throw e;
  });
  return modelPromise;
}

/** Probability (0..1) that the current frame shows explicit content. */
export async function explicitScore(video: HTMLVideoElement): Promise<number | null> {
  if (video.readyState < 2 || !video.videoWidth) return null;
  const model = await loadNsfwModel();
  const predictions = await model.classify(video);
  const p = (name: string) => predictions.find((x) => x.className === name)?.probability ?? 0;
  return p('Porn') + p('Hentai');
}

/** Small JPEG of a video frame for reports, kept under the server's size limit. */
export function snapshot(video: HTMLVideoElement | null): string | undefined {
  if (!video || video.readyState < 2 || !video.videoWidth) return undefined;
  const width = 320;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.7, 0.5, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_SNAPSHOT_BYTES) return url;
  }
  return undefined;
}
