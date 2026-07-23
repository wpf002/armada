'use client';

import { useEffect } from 'react';

/** Registers the PWA service worker (offline directory shell). */
export function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is best-effort */
      });
    }
  }, []);
  return null;
}
