'use client';
import Image from 'next/image';
import { useState } from 'react';
import { asset } from '@/lib/base-path';
export default function BrandFooter() {
  const [broken, setBroken] = useState(false);
  return (
    <footer className="brand-footer">
      <div className="brand-contact">
        <span>www.acuren.com</span>
        <span className="brand-divider" aria-hidden="true">
          |
        </span>
        <span suppressHydrationWarning>1-800-218-7450</span>
      </div>
      {broken ? (
        <span className="px-6 text-lg text-primary">A Higher Level of Reliability®</span>
      ) : (
        <div className="brand-tagline relative aspect-[514/41]">
          <Image
            src={asset('/branding/acuren-tagline.png')}
            alt="A Higher Level of Reliability®"
            fill
            unoptimized
            className="object-contain"
            onError={() => setBroken(true)}
          />
        </div>
      )}
    </footer>
  );
}
