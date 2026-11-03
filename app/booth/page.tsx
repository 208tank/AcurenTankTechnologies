import type { Metadata } from 'next';
import BoothMode from '@/components/tank/booth-mode';

export const metadata: Metadata = { title: 'Booth mode | Acuren Tank Integrity Services' };

export default function Page() {
  return <BoothMode />;
}
