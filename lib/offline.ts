'use client';
import { useEffect, useState } from 'react';
import { asset } from './base-path';

export type OfflineStatus =
  | { state: 'unsupported' | 'pending' }
  | { state: 'ready'; files: number }
  | { state: 'error'; message: string };

/** Everything this page has loaded so far (scripts, styles, images, data). */
function loadedUrls() {
  const resources = performance
    .getEntriesByType('resource')
    .map((e) => e.name.split('#')[0])
    .filter((u) => u.startsWith(location.origin));
  return Array.from(new Set([location.href.split('#')[0], ...resources]));
}

/**
 * Registers the offline service worker (production builds only) and asks it to
 * save every file this page has loaded. Returns how many files are saved.
 */
export function useOfflineSupport(): OfflineStatus {
  const [status, setStatus] = useState<OfflineStatus>({ state: 'pending' });

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') {
      setStatus({ state: 'unsupported' });
      return;
    }
    let cancelled = false;
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'cache-status' && !cancelled)
        setStatus({ state: 'ready', files: e.data.total });
    }
    navigator.serviceWorker.addEventListener('message', onMessage);

    async function run() {
      try {
        await navigator.serviceWorker.register(asset('/sw.js'), { scope: asset('/') });
        const reg = await navigator.serviceWorker.ready;
        // Wait a moment so lazily loaded pieces (like the 3D viewer) are included.
        await new Promise((r) => setTimeout(r, 4000));
        if (cancelled) return;
        reg.active?.postMessage({ type: 'cache-urls', urls: loadedUrls() });
      } catch (e) {
        console.error(e);
        if (!cancelled)
          setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    }
    void run();
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  return status;
}
