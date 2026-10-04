'use client';

import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    const video = ref.current;
    if (video && video.srcObject !== stream) video.srcObject = stream;
  }, [stream]);

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
    </div>
  );
}
