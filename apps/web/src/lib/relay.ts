'use client';

import type { RelayChunk } from '@rc/shared';

/**
 * Fallback video path when WebRTC cannot connect (strict NAT, no TURN): each
 * side records its camera with MediaRecorder in short chunks, sends them over
 * Socket.IO, and the partner plays them with Media Source Extensions.
 * Expect ~1–2 s of delay and lower quality than a direct call.
 */

const CHUNK_MS = 250;
/** Keep playback close to live: jump ahead when this far behind. */
const MAX_LAG_S = 1.5;
/** Drop played media older than this from the buffer. */
const KEEP_BUFFER_S = 20;

const MIME_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
];

type MediaSourceCtor = typeof MediaSource;
const mediaSourceCtor = (): MediaSourceCtor | null =>
  (window as unknown as { ManagedMediaSource?: MediaSourceCtor }).ManagedMediaSource ??
  (typeof MediaSource !== 'undefined' ? MediaSource : null);

export function relaySupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!mediaSourceCtor();
}

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export class RelaySender {
  private recorder: MediaRecorder | null = null;
  private seq = 0;

  constructor(
    private readonly stream: MediaStream,
    private readonly send: (chunk: RelayChunk) => void,
  ) {}

  /** Returns false when this browser cannot record. */
  start(): boolean {
    const mime = pickMime();
    if (!mime) return false;
    try {
      this.recorder = new MediaRecorder(this.stream, { mimeType: mime, videoBitsPerSecond: 350_000, audioBitsPerSecond: 32_000 });
    } catch {
      return false;
    }
    this.recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      const seq = this.seq++;
      void e.data.arrayBuffer().then((data) => this.send({ seq, mime, data }));
    };
    this.recorder.start(CHUNK_MS);
    return true;
  }

  stop() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
  }
}

export class RelayReceiver {
  private ms: MediaSource | null = null;
  private sb: SourceBuffer | null = null;
  private queue: ArrayBuffer[] = [];
  private url: string | null = null;
  private started = false;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onUnsupported: () => void,
  ) {}

  push(chunk: RelayChunk) {
    if (!this.started) {
      // The first chunk carries the container header; without it nothing decodes.
      if (chunk.seq !== 0) return;
      this.started = true;
      this.open(chunk.mime);
    }
    this.queue.push(chunk.data);
    this.flush();
  }

  private open(mime: string) {
    const Ctor = mediaSourceCtor();
    if (!Ctor || !Ctor.isTypeSupported(mime)) return this.onUnsupported();
    const ms = new Ctor();
    this.ms = ms;
    this.video.srcObject = null;
    // Required for ManagedMediaSource (Safari) to deliver data.
    (this.video as HTMLVideoElement & { disableRemotePlayback: boolean }).disableRemotePlayback = true;
    this.url = URL.createObjectURL(ms);
    this.video.src = this.url;
    ms.addEventListener(
      'sourceopen',
      () => {
        try {
          this.sb = ms.addSourceBuffer(mime);
          this.sb.mode = 'sequence';
          this.sb.addEventListener('updateend', () => {
            this.keepLive();
            this.flush();
          });
          this.flush();
        } catch {
          this.onUnsupported();
        }
      },
      { once: true },
    );
  }

  private flush() {
    const sb = this.sb;
    if (!sb || sb.updating || !this.queue.length || this.ms?.readyState !== 'open') return;
    try {
      sb.appendBuffer(this.queue.shift()!);
    } catch (e) {
      // QuotaExceeded: drop old media and retry later.
      if ((e as DOMException).name === 'QuotaExceededError' && sb.buffered.length) {
        sb.remove(0, Math.max(0, this.video.currentTime - 2));
      }
    }
  }

  private keepLive() {
    const sb = this.sb;
    if (!sb || sb.updating || !sb.buffered.length) return;
    const end = sb.buffered.end(sb.buffered.length - 1);
    if (end - this.video.currentTime > MAX_LAG_S) this.video.currentTime = Math.max(0, end - 0.3);
    if (this.video.paused) void this.video.play().catch(() => undefined);
    const start = sb.buffered.start(0);
    if (this.video.currentTime - start > KEEP_BUFFER_S) {
      try {
        sb.remove(start, this.video.currentTime - 5);
      } catch {
        /* busy; next update */
      }
    }
  }

  stop() {
    this.queue = [];
    try {
      if (this.ms?.readyState === 'open') this.ms.endOfStream();
    } catch {
      /* ignore */
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.video.removeAttribute('src');
    this.video.load();
    this.ms = null;
    this.sb = null;
  }
}
