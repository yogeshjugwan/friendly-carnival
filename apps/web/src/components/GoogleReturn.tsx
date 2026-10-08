'use client';

import { useEffect } from 'react';
import { finishGoogleReturn } from '@/lib/googleReturn';

/** See lib/googleReturn.ts. Also handles pages restored from the back/forward cache. */
export function GoogleReturn() {
  useEffect(() => {
    finishGoogleReturn();
    window.addEventListener('pageshow', finishGoogleReturn);
    return () => window.removeEventListener('pageshow', finishGoogleReturn);
  }, []);
  return null;
}
