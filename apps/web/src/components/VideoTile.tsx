'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
  /** Extra classes on the <video> element itself (e.g. blur). */
  videoClassName?: string;
  /** Receives the underlying <video> element (for snapshots and screening). */
  videoRef?: (el: HTMLVideoElement | null) => void;
  /** Show the video even without a MediaStream (relay playback sets src directly). */
  forceVisible?: boolean;
  children?: React.ReactNode;
}

export function VideoTile({ stream, muted, mirrored, className = '', videoClassName = '', videoRef, forceVisible, children }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  /** The browser refused to play sound without a tap (autoplay rules). */
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (!stream || muted) return setNeedsTap(false);
    video.play().then(
      () => setNeedsTap(false),
      (e: DOMException) => setNeedsTap(e.name === 'NotAllowedError'),
    );
  }, [stream, muted]);

  useEffect(() => {
    videoRef?.(ref.current);
    return () => videoRef?.(null);
  }, [videoRef]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-ink ${className}`}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${stream || forceVisible ? '' : 'invisible'} ${videoClassName}`}
      />
      {children}
      {needsTap && (
        <button
          onClick={() => void ref.current?.play().then(() => setNeedsTap(false), () => undefined)}
          className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-5 py-2.5 font-semibold text-ink shadow-xl"
        >
          🔊 Tap to turn on sound
        </button>
      )}
    </div>
  );
}
