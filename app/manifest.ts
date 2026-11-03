import type { MetadataRoute } from 'next';
import { asset } from '@/lib/base-path';

// Generated once at build time for the static site.
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Acuren — Tank Integrity Services',
    short_name: 'TankScope',
    description: 'Interactive storage tank inspection explorer',
    start_url: asset('/'),
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#002B5C',
    icons: [
      {
        src: asset('/branding/acuren-icon-192.png'),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: asset('/branding/acuren-icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
