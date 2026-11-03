import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler';

// Full public address of the site (set by the GitHub workflow). Link previews
// in email and chat apps need an absolute image URL.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');

// The favicon (app/icon.svg), Apple icon (app/apple-icon.png) and web manifest
// (app/manifest.ts) are picked up from their file names by Next.js.
export const metadata: Metadata = {
  ...(siteUrl && { metadataBase: new URL(`${siteUrl}/`) }),
  title: 'Acuren | Tank Integrity Services',
  description: 'Explore aboveground storage tank inspection technologies in 3D.',
  appleWebApp: { capable: true, title: 'Acuren TankScope' },
  openGraph: {
    title: 'Acuren — Tank Integrity Services',
    description: 'An interactive guide to storage tank inspection.',
    ...(siteUrl && { images: [`${siteUrl}/branding/acuren-social.png`] }),
  },
};

export const viewport: Viewport = { themeColor: '#002B5C' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          enableSystem={false}
        >
          {children}
          <ChunkLoadErrorHandler />
        </ThemeProvider>
      </body>
    </html>
  );
}
