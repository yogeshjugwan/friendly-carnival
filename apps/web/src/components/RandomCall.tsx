'use client';

import { useRandomCall } from '@/lib/useRandomCall';
import { ChatScreen } from './ChatScreen';
import { Landing } from './Landing';

export function RandomCall() {
  const call = useRandomCall();

  if (call.status === 'idle') return <Landing online={call.online} onStart={call.start} />;

  if (call.status === 'requesting-media') {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-2xl font-semibold">Click “Allow” to turn on your camera</p>
        <p className="text-slate-400">randomCall needs your camera and microphone to connect you with someone.</p>
      </main>
    );
  }

  if (call.status === 'media-denied') {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-2xl font-semibold">Camera or microphone blocked</p>
        <p className="max-w-md text-slate-400">
          Allow camera and microphone access for this site in your browser settings (the icon next to the address bar), then try
          again.
        </p>
        <button onClick={call.stop} className="rounded-lg bg-brand px-5 py-2 font-semibold">
          Back
        </button>
      </main>
    );
  }

  return <ChatScreen call={call} />;
}
