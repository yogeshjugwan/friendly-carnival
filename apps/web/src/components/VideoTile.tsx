'use client';

import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function VideoTile({ stream, muted, mirrored, className = '', children }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (video && video.srcObject !== stream) video.srcObject = stream;
  }, [stream]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-ink ${className}`}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${stream ? '' : 'invisible'}`}
      />
      {children}
    </div>
  );
}
