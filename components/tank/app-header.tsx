'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Box, Library, Presentation } from 'lucide-react';
import { asset } from '@/lib/base-path';
export default function AppHeader({
  manage = false,
  present = false,
}: {
  manage?: boolean;
  present?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <header className="brand-header">
      <div className="mx-auto flex min-h-[100px] max-w-[1920px] items-center justify-between gap-4 px-5 md:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-5"
          aria-label="Acuren TankScope home"
        >
          {broken ? (
            <span className="text-xl font-bold">ACUREN</span>
          ) : (
            <div className="relative aspect-[137.96/90.23] w-[98px] bg-white">
              <Image
                src={asset('/branding/acuren-logo.svg')}
                alt="Acuren"
                fill
                priority
                unoptimized
                className="object-contain"
                onError={() => setBroken(true)}
              />
            </div>
          )}
          <div className="hidden border-l border-border pl-5 sm:block">
            <div className="text-lg font-bold text-foreground">Tank Integrity Services</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              TankScope · Interactive inspection explorer
            </div>
          </div>
        </Link>
        <nav className="flex self-stretch items-stretch gap-4 text-xs md:gap-8">
          <Link
            href="/"
            aria-label="3D Explorer"
            aria-current={!manage && !present ? 'page' : undefined}
            className={`flex items-center gap-2 border-b-[3px] ${!manage && !present ? 'border-[var(--brand-cyan)] font-bold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Box size={16} />
            <span className="hidden sm:inline">3D Explorer</span>
          </Link>
          <Link
            href="/manage"
            aria-label="Technology library"
            aria-current={manage ? 'page' : undefined}
            className={`flex items-center gap-2 border-b-[3px] ${manage ? 'border-[var(--brand-cyan)] font-bold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Library size={16} />
            <span className="hidden sm:inline">Technology library</span>
          </Link>
          <Link
            href="/present"
            aria-label="Build presentation"
            aria-current={present ? 'page' : undefined}
            className={`flex items-center gap-2 border-b-[3px] ${present ? 'border-[var(--brand-cyan)] font-bold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Presentation size={16} />
            <span className="hidden sm:inline">Build presentation</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
