import Link from 'next/link';
import { Library, ScanLine } from 'lucide-react';

/** Switch between the technology library and equipment slides. */
export default function LibraryTabs({ active }: { active: 'technologies' | 'equipment' }) {
  const tab = (id: typeof active, href: string, label: string, Icon: typeof Library) => (
    <Link
      href={href}
      aria-current={active === id ? 'page' : undefined}
      className={`flex items-center gap-2 border-b-[3px] px-1 pb-3 text-sm ${active === id ? 'border-[var(--brand-cyan)] font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
    >
      <Icon size={15} />
      {label}
    </Link>
  );
  return (
    <nav aria-label="Library sections" className="mb-6 flex gap-6 border-b border-border">
      {tab('technologies', '/manage', 'Technologies', Library)}
      {tab('equipment', '/manage/equipment', 'Equipment slides', ScanLine)}
    </nav>
  );
}
