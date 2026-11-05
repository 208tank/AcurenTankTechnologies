'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Maximize,
  Minimize,
  RotateCcw,
  Layers,
  MousePointer2,
  Move,
  ZoomIn,
  Search,
  ArrowUpRight,
  Info,
  ChevronRight,
  Tag,
  Box,
  SlidersHorizontal,
  ShieldCheck,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { Section, TankType, sections, tankTypes, applicable } from '@/lib/tank-data';
import { useTankData } from './use-tank-data';
import type { ShellMode } from './shell-scan';

const SHELL_VIEW_NAMES: Record<ShellMode, string> = {
  ut: 'UT READINGS',
  aut: 'AUT C-SCAN',
  laser: '3D LASER SCAN',
};
import AppHeader from './app-header';
import BrandFooter from './brand-footer';
import TechnologyCard from './technology-card';
const TankViewer = dynamic(() => import('./tank-viewer'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="eyebrow animate-pulse">Preparing 3D workspace…</div>
    </div>
  ),
});
function TankIcon({ kind }: { kind: TankType }) {
  return (
    <svg width="40" height="33" viewBox="0 0 48 38" fill="none" aria-hidden="true">
      <path d="M7 13V29C7 36 41 36 41 29V13" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="24" cy="13" rx="17" ry="5" stroke="currentColor" strokeWidth="1.2" />
      {kind !== 'efr' && (
        <path d="M7 12L24 3L41 12M7 23C7 30 41 30 41 23" stroke="currentColor" strokeWidth="1.2" />
      )}
      {kind === 'efr' && <ellipse cx="24" cy="18" rx="14" ry="4" stroke="currentColor" />}
      {kind === 'insulated' && (
        <path
          d="M12 16V30M18 18V32M24 19V33M30 18V32M36 16V30"
          stroke="currentColor"
          opacity=".5"
        />
      )}
    </svg>
  );
}
export default function Explorer() {
  const { data, error } = useTankData();
  const [type, setType] = useState<TankType>('ifr');
  const [selected, setSelected] = useState<Section>('floor');
  const [cutaway, setCutaway] = useState(true);
  const [labels, setLabels] = useState(true);
  const [reset, setReset] = useState(0);
  // Floor C-scan view: opens when the user picks the floor, not on first load.
  const [floorOpen, setFloorOpen] = useState(false);
  // Shell inspection view (UT readings, AUT C-scan or laser scan): opens when the user picks the shell.
  const [shellMode, setShellMode] = useState<ShellMode | null>(null);
  const lastShellMode = useRef<ShellMode>('ut');
  const showShell = useCallback((m: ShellMode | null) => {
    if (m) lastShellMode.current = m;
    setShellMode(m);
  }, []);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>('mfl');
  const [full, setFull] = useState(false);
  // The 3D view (and its inspection panel) filling the screen. Uses the browser's full-screen
  // mode where it has one for elements; otherwise (iPhone Safari) the view is pinned over the page.
  const grid = useRef<HTMLDivElement>(null);
  const [viewFull, setViewFull] = useState(false);
  const [viewPinned, setViewPinned] = useState(false);
  const [panel, setPanel] = useState(true);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const changed = () => {
      setFull(document.fullscreenElement === document.documentElement);
      setViewFull(!!grid.current && document.fullscreenElement === grid.current);
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const choose = useCallback((s: Section) => {
    setSelected(s);
    setFloorOpen(s === 'floor');
    setShellMode((m) => (s === 'shell' ? (m ?? lastShellMode.current) : null));
    // The shell views wrap the whole shell, so show it uncut.
    if (s === 'shell') setCutaway(false);
    setPanel(true);
    setQuery('');
    setOpen(null);
    if (s === 'floor' || s === 'floating' || s === 'seal') setCutaway(true);
  }, []);
  const visible = useMemo(
    () =>
      data.filter(
        (t) =>
          applicable(t, type, selected) &&
          `${t.name} ${t.subtitle} ${t.detects}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [data, type, selected, query],
  );
  const current = sections.find((s) => s.id === selected);
  const count = data.filter((t) => applicable(t, type)).length;
  function changeType(t: TankType) {
    setType(t);
    if (t === 'efr' && selected === 'roof') setSelected('floating');
    setOpen(null);
  }
  async function toggleView() {
    const el = grid.current;
    if (!el) return;
    if (viewPinned) {
      setViewPinned(false);
      return;
    }
    if (document.fullscreenElement === el) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    try {
      if (typeof el.requestFullscreen !== 'function') throw new Error('no element full screen');
      if (document.fullscreenElement) await document.exitFullscreen();
      await el.requestFullscreen();
    } catch {
      setViewPinned(true);
    }
  }
  // Pinned view: Esc closes it, and the page behind does not scroll.
  useEffect(() => {
    if (!viewPinned) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewPinned(false);
    };
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
    };
  }, [viewPinned]);
  const viewIsFull = viewFull || viewPinned;
  async function fullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFull(false);
      } else {
        await document.documentElement.requestFullscreen();
        setFull(true);
      }
    } catch (e) {
      console.error(e);
      setNotice(
        'Full screen is blocked by this preview or browser. Use your browser’s full-screen command instead.',
      );
    }
  }
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="presentation-shell px-4 pb-4 pt-6 md:px-8">
        <div className="brand-intro mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Workspace</span>
              <ChevronRight size={10} />
              <span className="text-foreground">Tank inspection</span>
            </div>
            <h1 className="font-display text-[30px] font-bold tracking-tight">
              Tank Integrity Services
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Explore the structure. Select a section. Discover the right inspection technology.
            </p>
          </div>
          <button className="tool-button" onClick={fullscreen}>
            {full ? <Minimize size={14} /> : <Maximize size={14} />}Present full screen
          </button>
        </div>
        {notice && (
          <div
            role="status"
            className="mb-3 flex justify-between rounded-lg border border-border bg-secondary p-3 text-xs"
          >
            {notice}
            <button onClick={() => setNotice('')} className="ml-3 underline">
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mb-3 text-xs text-destructive">
            {error}
          </p>
        )}
        <div
          ref={grid}
          className={`explorer-grid grid overflow-hidden rounded-xl border border-border ${viewPinned ? 'is-full' : ''}`}
          style={!panel ? { gridTemplateColumns: '1fr' } : undefined}
        >
          <section
            className="viewer-stage relative min-w-0 overflow-hidden"
            aria-label="3D tank workspace"
          >
            <TankViewer
              type={type}
              cutaway={cutaway}
              selected={selected}
              onSelect={choose}
              reset={reset}
              labels={labels}
              floorView={floorOpen}
              onCloseFloor={() => setFloorOpen(false)}
              shellView={shellMode}
              onShellView={showShell}
            />
            <div className="absolute left-5 right-5 top-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="eyebrow">01 / Tank configuration</span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setPanel(!panel)}
                  aria-label={panel ? 'Hide inspection panel' : 'Show inspection panel'}
                >
                  {panel ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
                </button>
              </div>
              <div className="flex gap-2">
                {tankTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => changeType(t.id)}
                    aria-pressed={type === t.id}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-3 text-left backdrop-blur-md ${type === t.id ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card/85 text-muted-foreground hover:border-input hover:text-foreground'}`}
                  >
                    <span className="hidden xl:block">
                      <TankIcon kind={t.id} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold sm:text-xs">{t.name}</div>
                      <div className="mt-1 hidden truncate text-[9px] text-muted-foreground sm:block">
                        {t.description}
                      </div>
                    </div>
                    <span
                      className={`ml-auto hidden h-3 w-3 shrink-0 rounded-full border sm:block ${type === t.id ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_hsl(var(--card))]' : 'border-input'}`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="absolute left-5 top-[133px] flex items-center gap-2">
              <span className="rounded border border-border bg-card/80 px-2 py-1 font-mono text-[9px] tracking-wider text-muted-foreground">
                {floorOpen
                  ? 'FLOOR SCAN VIEW'
                  : shellMode
                    ? `SHELL · ${SHELL_VIEW_NAMES[shellMode]}`
                    : cutaway
                      ? 'CUTAWAY VIEW'
                      : 'EXTERIOR VIEW'}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {type === 'insulated' ? 'INS' : type.toUpperCase()} / STEEL PONTOON
              </span>
            </div>
            <div className="absolute bottom-16 right-4 flex flex-col gap-2">
              <button
                title={viewIsFull ? 'Exit full screen' : 'Full screen 3D view'}
                aria-label={viewIsFull ? 'Exit full screen' : 'Full screen 3D view'}
                aria-pressed={viewIsFull}
                className={`tool-button !p-2.5 ${viewIsFull ? 'text-primary' : ''}`}
                onClick={toggleView}
              >
                {viewIsFull ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
              <button
                title="Reset camera"
                aria-label="Reset camera"
                className="tool-button !p-2.5"
                onClick={() => {
                  setFloorOpen(false);
                  setShellMode(null);
                  setReset((n) => n + 1);
                }}
              >
                <RotateCcw size={16} />
              </button>
              <button
                title="Toggle section labels"
                aria-label="Toggle section labels"
                aria-pressed={labels}
                className={`tool-button !p-2.5 ${labels ? 'text-primary' : ''}`}
                onClick={() => setLabels(!labels)}
              >
                <Tag size={16} />
              </button>
            </div>
            <div className="absolute bottom-[66px] left-5">
              <button
                onClick={() => setCutaway(!cutaway)}
                aria-pressed={cutaway}
                className="tool-button bg-card/90"
              >
                <Layers size={15} className={cutaway ? 'text-primary' : ''} />
                Cutaway
                <span
                  className={`relative ml-2 h-4 w-7 rounded-full ${cutaway ? 'bg-primary' : 'bg-input'}`}
                >
                  <span
                    className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-background transition-all ${cutaway ? 'left-[15px]' : 'left-[3px]'}`}
                  />
                </span>
              </button>
            </div>
            <div className="absolute bottom-0 flex h-12 w-full items-center justify-between gap-3 border-t border-border bg-card/85 px-5 text-[10px] text-muted-foreground backdrop-blur-md">
              <div className="flex gap-4">
                <span className="flex items-center gap-1.5">
                  <Move size={12} />
                  Drag to rotate
                </span>
                <span className="hidden items-center gap-1.5 sm:flex">
                  <ZoomIn size={12} />
                  Scroll to zoom
                </span>
                <span className="hidden items-center gap-1.5 lg:flex">
                  <MousePointer2 size={12} />
                  Select a section
                </span>
              </div>
              <span className="flex items-center gap-1.5 font-mono text-[9px]">
                <span className="h-1 w-1 rounded-full bg-primary" />
                3D INTERACTIVE
              </span>
            </div>
          </section>
          {panel && (
            <aside className="inspector flex min-h-0 flex-col border-l border-border bg-card">
              <div className="border-b border-border px-5 pb-4 pt-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="eyebrow">02 / Inspection technologies</span>
                  <SlidersHorizontal size={14} className="text-muted-foreground" />
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg bg-background p-1">
                  {sections
                    .filter((s) => !(type === 'efr' && s.id === 'roof'))
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => choose(s.id)}
                        aria-pressed={s.id === selected}
                        className={`flex-1 whitespace-nowrap rounded-md px-2 py-2 text-[10px] font-medium ${selected === s.id ? 'bg-secondary text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {s.id === 'floating'
                          ? 'Floater'
                          : s.id === 'roof'
                            ? 'Roof'
                            : s.id === 'seal'
                              ? 'Seal'
                              : s.name}
                      </button>
                    ))}
                </div>
                <div className="mb-1 mt-5 flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold">{current?.name} inspection</h2>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary">
                    {visible.length} methods
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">{current?.description}</p>
                <div className="relative mt-4">
                  <Search size={13} className="absolute left-3 top-3 text-muted-foreground" />
                  <input
                    aria-label="Search inspection technologies"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find a technology…"
                    className="!py-2.5 !pl-9 !text-[11px]"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                {visible.map((t, i) => (
                  <TechnologyCard
                    key={t.id}
                    item={t}
                    index={i}
                    open={open === t.id}
                    onToggle={() => setOpen(open === t.id ? null : t.id)}
                  />
                ))}
                {visible.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No matching technologies. Try another search or add one to the library.
                  </p>
                )}
              </div>
              <Link
                href="/manage"
                className="flex items-center justify-between border-t border-border px-5 py-3.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Make this workspace yours{' '}
                <span className="flex items-center gap-1 text-primary">
                  Edit library
                  <ArrowUpRight size={13} />
                </span>
              </Link>
            </aside>
          )}
        </div>
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <Box size={12} />
              <strong className="stat-number font-normal text-foreground">3</strong> tank
              configurations
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} />
              <strong className="stat-number font-normal text-foreground">{count}</strong>{' '}
              applicable technologies
            </span>
            <span className="hidden items-center gap-1.5 md:flex">
              <span className="h-1 w-1 rounded-full bg-primary" />
              Browser-saved library
            </span>
          </div>
          <span className="flex items-center gap-1.5">
            <Info size={12} />
            Illustrative model · not to scale
          </span>
        </footer>
        <details className="mt-4 border-t border-border pt-3 text-[10px] text-muted-foreground">
          <summary className="w-fit cursor-pointer hover:text-foreground">
            Inspection guidance & safety notes
          </summary>
          <p className="mt-2 max-w-4xl leading-relaxed">
            Educational presentation aid, not an inspection procedure or fitness-for-service
            determination. API 653 is a framework, not blanket approval of every listed method.
            Select qualified personnel, procedures, calibration, coverage and acceptance criteria
            appropriate to the tank. Confirm screening indications with suitable NDE. Follow
            isolation, confined-space, hazardous-area and work-at-height requirements. The model
            omits design-specific internals and shows a representative steel pan with peripheral
            pontoons. Export your library before clearing browser data or moving to another device.
          </p>
        </details>
      </main>
      <BrandFooter />
    </div>
  );
}
