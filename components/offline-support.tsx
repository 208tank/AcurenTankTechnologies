'use client';
import { useOfflineSupport } from '@/lib/offline';

/** Saves the site to the browser on every visit so it keeps working offline. */
export function OfflineSupport() {
  useOfflineSupport();
  return null;
}
