'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, ArrowDown, MonitorPlay, Play, ScanLine, Search, X } from 'lucide-react';
import { Section, Technology, sections, tankTypes, TankType } from '@/lib/tank-data';
import {
  DeckItem,
  PresentationSlide,
  PRESENTATION_KEY,
  isEquipmentItem,
  validatePresentation,
  serializePresentation,
  createSlide,
  resolveDeck,
  resolveSlides,
  moveSlide,
  slideTypes,
  slideSections,
} from '@/lib/tank-presentation';
import { Equipment } from '@/lib/equipment';
import { useTankData } from './use-tank-data';
import { useEquipment } from './use-equipment';
import AppHeader from './app-header';
import BrandFooter from './brand-footer';
import PresentationPlayer from './presentation-player';
export default function PresentationBuilder() {
  const { data, ready, error } = useTankData();
  const { items: equipment, ready: equipmentReady } = useEquipment();
  const [slides, setSlides] = useState<DeckItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<Section | 'all'>('all');
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESENTATION_KEY);
      if (raw) {
        setSlides(validatePresentation(JSON.parse(raw)));
        setSaveMessage('Saved presentation loaded.');
      }
    } catch (e) {
      console.error(e);
      setSaveError(
        'Your saved presentation could not be loaded. It will only be replaced when you change the selection.',
      );
    }
    setLoaded(true);
  }, []);
  const resolved = useMemo(() => resolveDeck(slides, data, equipment), [slides, data, equipment]);
  const canEdit = ready && loaded && equipmentReady;
  const hasTech = (id: string) => slides.some((s) => !isEquipmentItem(s) && s.technologyId === id);
  const hasEquipment = (id: string) =>
    slides.some((s) => isEquipmentItem(s) && s.equipmentId === id);
  const visible = data.filter(
    (t) =>
      (section === 'all' || t.sections.includes(section)) &&
      `${t.name} ${t.subtitle}`.toLowerCase().includes(query.toLowerCase()),
  );
  function save(next: DeckItem[]) {
    setSlides(next);
    try {
      localStorage.setItem(PRESENTATION_KEY, serializePresentation(next));
      setSaveMessage('Selection and order saved in this browser.');
      setSaveError('');
    } catch (e) {
      console.error(e);
      setSaveMessage('');
      setSaveError(
        'Changes are available for this session but could not be saved. Browser storage may be blocked or full.',
      );
    }
  }
  function toggle(t: Technology) {
    const next = createSlide(t);
    save(
      hasTech(t.id)
        ? slides.filter((s) => isEquipmentItem(s) || s.technologyId !== t.id)
        : next
          ? [...slides, next]
          : slides,
    );
  }
  function toggleEquipment(e: Equipment) {
    save(
      hasEquipment(e.id)
        ? slides.filter((s) => !isEquipmentItem(s) || s.equipmentId !== e.id)
        : [...slides, { equipmentId: e.id }],
    );
  }
  function configure(index: number, patch: Partial<PresentationSlide>) {
    save(slides.map((s, i) => (i === index && !isEquipmentItem(s) ? { ...s, ...patch } : s)));
  }
  if (playing && resolved.length)
    return <PresentationPlayer slides={resolved} onExit={() => setPlaying(false)} />;
  return (
    <div className="min-h-screen">
      <AppHeader present />
      <main className="mx-auto max-w-[1600px] px-5 py-7 md:px-8">
        <div className="brand-intro mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Your talk. Your technologies and equipment.</p>
            <h1 className="text-3xl font-bold tracking-tight">Build presentation</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Select technologies and equipment, arrange the order, then present one slide at a
              time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/booth" className="tool-button">
              <MonitorPlay size={16} />
              Booth mode
            </Link>
            <button
              className="tool-button primary-button"
              disabled={!canEdit || !resolved.length}
              onClick={() => setPlaying(true)}
            >
              <Play size={16} />
              Start presentation
            </button>
          </div>
        </div>
        <p role="status" className="mb-5 text-xs text-muted-foreground">
          {saveMessage || 'Selections save automatically in this browser only.'} Library changes
          appear here automatically.
        </p>
        {(error || saveError) && (
          <p
            role="alert"
            className="mb-5 rounded border border-destructive p-3 text-sm text-destructive"
          >
            {error || saveError}
          </p>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
          <section
            aria-label="Choose slides"
            className="rounded-lg border border-border bg-card p-5"
          >
            <h2 className="mb-4 text-xl font-semibold">1. Choose slides</h2>
            <h3 className="mb-3 text-sm font-semibold">Technologies</h3>
            <div className="mb-4 flex flex-wrap gap-3">
              <div className="relative min-w-[180px] flex-1">
                <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
                <input
                  aria-label="Search technologies for presentation"
                  placeholder="Search technologies…"
                  className="!pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                aria-label="Filter presentation technologies by section"
                className="rounded border border-input bg-card p-2 text-sm"
                value={section}
                onChange={(e) => setSection(e.target.value as Section | 'all')}
              >
                <option value="all">All sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-y-auto">
              {visible.map((t) => (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-start gap-3 rounded border p-4 ${hasTech(t.id) ? 'border-primary/40 bg-secondary' : 'border-border'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={hasTech(t.id)}
                    disabled={!canEdit || !createSlide(t)}
                    onChange={() => toggle(t)}
                  />
                  <span>
                    <span className="block text-sm font-semibold">{t.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{t.subtitle}</span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {t.sections.map((s) => sections.find((x) => x.id === s)?.name).join(' · ')}
                    </span>
                    {!createSlide(t) && (
                      <span className="block text-xs text-destructive">
                        No compatible tank and section. Edit this method in the library.
                      </span>
                    )}
                  </span>
                </label>
              ))}
              {!visible.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  No matching technologies. Try another search or{' '}
                  <Link href="/manage" className="underline">
                    add one in the library
                  </Link>
                  .
                </p>
              )}
            </div>
            <div className="mt-6 border-t border-border pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Equipment slides</h3>
                <Link href="/manage/equipment" className="text-xs underline">
                  Edit equipment slides
                </Link>
              </div>
              <div className="space-y-2">
                {equipment.map((e) => (
                  <label
                    key={e.id}
                    className={`flex cursor-pointer items-start gap-3 rounded border p-4 ${hasEquipment(e.id) ? 'border-primary/40 bg-secondary' : 'border-border'}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={hasEquipment(e.id)}
                      disabled={!canEdit}
                      onChange={() => toggleEquipment(e)}
                    />
                    <span>
                      <span className="block text-sm font-semibold">{e.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {[e.maker, e.tagline].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                ))}
                {!equipment.length && (
                  <p className="p-3 text-sm text-muted-foreground">
                    No equipment slides yet.{' '}
                    <Link href="/manage/equipment" className="underline">
                      Create one
                    </Link>
                    .
                  </p>
                )}
              </div>
            </div>
          </section>
          <section
            aria-label="Presentation order"
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">2. Arrange your slides</h2>
              <span className="text-sm text-muted-foreground">{resolved.length} ready</span>
            </div>
            <p className="mb-5 text-xs leading-5 text-muted-foreground">
              Use the arrows to reorder. Choose the tank and highlighted section for each
              technology. Equipment slides can go anywhere.
            </p>
            {!slides.length && (
              <p className="rounded border border-dashed border-input p-8 text-center text-sm text-muted-foreground">
                Select technologies and equipment on the left to build your presentation.
              </p>
            )}
            <ol className="space-y-3">
              {slides.map((s, i) => {
                if (isEquipmentItem(s)) {
                  const e = equipment.find((x) => x.id === s.equipmentId);
                  const label = e?.name || 'Unavailable equipment slide';
                  return (
                    <li key={`e:${s.equipmentId}`} className="rounded border border-border p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {i + 1}
                        </span>
                        <h3 className="min-w-0 flex-1 text-sm font-semibold">
                          <span className="flex items-center gap-2">
                            <ScanLine size={14} className="shrink-0 text-primary" />
                            {label}
                          </span>
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            {e
                              ? `Equipment slide${e.maker ? ` · ${e.maker}` : ''}`
                              : 'Deleted from the library; it will be skipped.'}
                          </span>
                        </h3>
                        <button
                          className="tool-button !p-2"
                          disabled={!canEdit || i === 0}
                          aria-label={`Move ${label} up`}
                          onClick={() => save(moveSlide(slides, i, -1))}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          className="tool-button !p-2"
                          disabled={!canEdit || i === slides.length - 1}
                          aria-label={`Move ${label} down`}
                          onClick={() => save(moveSlide(slides, i, 1))}
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          className="tool-button !p-2"
                          disabled={!canEdit}
                          aria-label={`Remove ${label} from presentation`}
                          onClick={() => save(slides.filter((_, index) => index !== i))}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </li>
                  );
                }
                const r = resolveSlides([s], data)[0];
                return (
                  <li key={`t:${s.technologyId}`} className="rounded border border-border p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                        {i + 1}
                      </span>
                      <h3 className="min-w-0 flex-1 text-sm font-semibold">
                        {r?.technology.name ||
                          data.find((t) => t.id === s.technologyId)?.name ||
                          'Unavailable technology'}
                      </h3>
                      <button
                        className="tool-button !p-2"
                        disabled={!canEdit || i === 0}
                        aria-label={`Move ${r?.technology.name || 'unavailable technology'} up`}
                        onClick={() => save(moveSlide(slides, i, -1))}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="tool-button !p-2"
                        disabled={!canEdit || i === slides.length - 1}
                        aria-label={`Move ${r?.technology.name || 'unavailable technology'} down`}
                        onClick={() => save(moveSlide(slides, i, 1))}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="tool-button !p-2"
                        disabled={!canEdit}
                        aria-label={`Remove ${r?.technology.name || 'unavailable technology'} from presentation`}
                        onClick={() => save(slides.filter((_, index) => index !== i))}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {r ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs">
                          Tank configuration
                          <select
                            className="mt-1 block w-full rounded border border-input bg-background p-2 text-xs"
                            value={r.tankType}
                            onChange={(e) => {
                              const tankType = e.target.value as TankType;
                              const allowed = slideSections(r.technology, tankType);
                              configure(i, {
                                tankType,
                                section: allowed.includes(r.section) ? r.section : allowed[0],
                              });
                            }}
                          >
                            {slideTypes(r.technology).map((type) => (
                              <option key={type} value={type}>
                                {tankTypes.find((t) => t.id === type)?.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs">
                          Highlighted section
                          <select
                            className="mt-1 block w-full rounded border border-input bg-background p-2 text-xs"
                            value={r.section}
                            onChange={(e) => configure(i, { section: e.target.value as Section })}
                          >
                            {slideSections(r.technology, r.tankType).map((id) => (
                              <option key={id} value={id}>
                                {sections.find((x) => x.id === id)?.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-destructive">
                        This technology was removed or has no compatible configuration. It will be
                        skipped; remove it here or update the library.
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            <button
              className="tool-button primary-button mt-5 w-full"
              disabled={!canEdit || !resolved.length}
              onClick={() => setPlaying(true)}
            >
              <Play size={16} />
              Start presentation · {resolved.length} slides
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Use Next / Previous or the keyboard arrow keys during your talk.
            </p>
          </section>
        </div>
      </main>
      <BrandFooter />
    </div>
  );
}
