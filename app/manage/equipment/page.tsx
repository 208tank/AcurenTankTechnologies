import type { Metadata } from 'next';
import EquipmentLibrary from '@/components/tank/equipment-library';

export const metadata: Metadata = { title: 'Equipment slides | Acuren Tank Integrity Services' };

export default function Page() {
  return <EquipmentLibrary />;
}
