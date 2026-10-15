'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:4100';

/** Live "All systems working" line from the server's /health check. */
export function ServiceStatus() {
  const [state, setState] = useState<'checking' | 'up' | 'down'>('checking');
  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 10_000);
    fetch(`${API}/health`, { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => setState(r.ok ? 'up' : 'down'))
      .catch(() => setState('down'))
      .finally(() => window.clearTimeout(t));
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, []);
  const dot = state === 'up' ? 'bg-lime' : state === 'down' ? 'bg-red-400' : 'bg-faint';
  const text =
    state === 'up' ? 'All systems working' : state === 'down' ? 'Having trouble reaching our servers — try again in a minute' : 'Checking status…';
  return (
    <p role="status" className="m-0 flex items-center gap-2 text-[13px] text-[#e6e8ec]">
      <span aria-hidden className={`h-2.5 w-2.5 flex-none rounded-full ${dot}`} />
      {text}
    </p>
  );
}
