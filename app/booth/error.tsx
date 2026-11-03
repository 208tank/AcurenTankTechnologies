'use client';
import { useEffect } from 'react';

// An unattended booth screen should never stay stuck on an error: retry
// automatically after a few seconds.
export default function BoothError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    const t = window.setTimeout(reset, 5000);
    return () => window.clearTimeout(t);
  }, [error, reset]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-12 text-center text-sm text-muted-foreground">
      Something went wrong. Restarting the display…
    </div>
  );
}
