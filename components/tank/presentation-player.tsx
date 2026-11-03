'use client';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Maximize, Minimize, RotateCcw, X } from 'lucide-react';
import { sections, tankTypes } from '@/lib/tank-data';
import { ResolvedItem } from '@/lib/tank-presentation';
import EquipmentSlide from './equipment-slide';
import { useTankData } from './use-tank-data';
const TankViewer = dynamic(() => import('./tank-viewer'), {
  ssr: false,
  loading: () => (
    <p className="absolute inset-0 flex items-center justify-center text-sm">
      Preparing tank model…
    </p>
  ),
});
const keepSlideSection = () => {};
type Props = { slides: ResolvedItem[]; onExit: () => void };
export default function PresentationPlayer({ slides, onExit }: Props) {
  const { data } = useTankData();
  // The tank model keeps showing the nearest earlier technology during
  // equipment slides, so returning to a technology slide doesn't jump.
  const lastTech = useMemo(
    () =>
      slides.map((_, i) => {
        for (let j = i; j >= 0; j--) {
          const s = slides[j];
          if (s.kind === 'tech') return s.slide;
        }
        const first = slides.find((s) => s.kind === 'tech');
        return first?.kind === 'tech' ? first.slide : null;
      }),
    [slides],
  );
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const [notice, setNotice] = useState('');
  const [reset, setReset] = useState(0);
  const [broken, setBroken] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const position = Math.min(index, slides.length - 1);
  const item = slides[position];
  const current = lastTech[position];
  const t = current?.technology;
  const badgeFor = (technologyId: string) => {
    const related = data.find((x) => x.id === technologyId);
    return related ? `${related.name} equipment` : 'Equipment';
  };
  const step = useCallback(
    (delta: number) => setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + delta))),
    [slides.length],
  );
  const exit = useCallback(() => {
    if (document.fullscreenElement === root.current)
      void document.exitFullscreen().catch((e) => console.error(e));
    onExit();
  }, [onExit]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setIndex(slides.length - 1);
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        exit();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [step, exit, slides.length]);
  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    setBroken(false);
    content.current?.scrollTo({ top: 0 });
    title.current?.focus({ preventScroll: true });
  }, [index]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch (e) {
      console.error(e);
      setNotice(
        'Full screen is blocked by this browser or preview. You can still present here, or use your browser’s full-screen command.',
      );
    }
  }
  return (
    <div ref={root} className="slide-player bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
        <div>
          <p className="text-lg font-bold">
            ACUREN <span className="ml-2 text-sm font-normal">Tank Integrity Services</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Technology presentation</p>
        </div>
        <div className="flex gap-2">
          <button className="tool-button" onClick={fullscreen}>
            {full ? <Minimize size={15} /> : <Maximize size={15} />}
            <span>{full ? 'Exit full screen' : 'Full screen'}</span>
          </button>
          <button className="tool-button" onClick={exit}>
            <X size={15} />
            Back to builder
          </button>
        </div>
      </header>
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 bg-secondary p-3 text-sm"
        >
          {notice}
          <button aria-label="Dismiss full-screen message" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {item.kind === 'equipment' || !current || !t ? (
        <div className="equip-in-player">
          {item.kind === 'equipment' && (
            <>
              <EquipmentSlide item={item.equipment} badge={badgeFor(item.equipment.technologyId)} />
              <h1 ref={title} tabIndex={-1} id="slide-title" className="sr-only">
                {item.equipment.name}
              </h1>
            </>
          )}
        </div>
      ) : (
        <div className="slide-layout">
          <section
            className="slide-model viewer-stage relative overflow-hidden"
            aria-label="Presentation tank model"
          >
            <TankViewer
              type={current.tankType}
              cutaway={current.section !== 'shell' && current.section !== 'roof'}
              selected={current.section}
              onSelect={keepSlideSection}
              reset={reset}
              labels={false}
            />
            <div className="absolute left-5 right-5 top-5 rounded border border-border bg-card/95 p-3">
              <p className="eyebrow">Highlighted tank section</p>
              <p className="mt-1 text-xl font-bold">
                {sections.find((s) => s.id === current.section)?.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tankTypes.find((s) => s.id === current.tankType)?.name}
              </p>
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
              <span className="rounded bg-card/95 p-2 text-xs text-muted-foreground">
                Drag to rotate · Scroll to zoom
              </span>
              <button className="tool-button" onClick={() => setReset((n) => n + 1)}>
                <RotateCcw size={15} />
                Reset view
              </button>
            </div>
          </section>
          <article ref={content} className="slide-content" aria-labelledby="slide-title">
            <p className="eyebrow mb-3">
              {current.section === 'floating'
                ? 'Floating roof'
                : sections.find((s) => s.id === current.section)?.name}{' '}
              inspection
            </p>
            <h1
              ref={title}
              tabIndex={-1}
              id="slide-title"
              className="text-3xl font-bold tracking-tight outline-none md:text-4xl"
            >
              {t.name}
            </h1>
            <p className="mb-6 mt-2 text-lg text-muted-foreground">{t.subtitle}</p>
            <p className="mb-6 text-base leading-relaxed">{t.description}</p>
            {t.imageUrl && !broken && (
              <div className="relative mb-6 aspect-video rounded bg-secondary">
                <Image
                  src={t.imageUrl}
                  alt={`${t.name} inspection reference`}
                  fill
                  unoptimized
                  className="object-contain"
                  onError={() => setBroken(true)}
                />
              </div>
            )}
            {broken && (
              <p className="mb-4 text-sm text-muted-foreground">Reference image is unavailable.</p>
            )}
            <div className="space-y-6">
              {[
                ['What it detects', t.detects],
                ['How it works', t.howItWorks],
                ['Advantages', t.advantages],
                ['Limitations & considerations', t.limitations],
              ]
                .filter(([, text]) => text)
                .map(([heading, text]) => (
                  <section key={heading}>
                    <h2 className="mb-2 border-l-[3px] border-[var(--brand-cyan)] pl-3 text-lg font-bold">
                      {heading}
                    </h2>
                    <p className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
                      {text}
                    </p>
                  </section>
                ))}
            </div>
            {t.notes && (
              <details className="mt-6 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm">
                  Presenter notes (visible to your audience when opened)
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{t.notes}</p>
              </details>
            )}
            <p className="mt-8 text-xs text-muted-foreground">
              Educational guidance · Illustrative model, not to scale. Use qualified procedures and
              personnel.
            </p>
          </article>
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-4">
        <button className="tool-button" disabled={index === 0} onClick={() => step(-1)}>
          <ArrowLeft size={17} />
          Previous
        </button>
        <div className="text-center">
          <p role="status" aria-live="polite" className="text-sm font-semibold">
            Slide {index + 1} of {slides.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {index === slides.length - 1
              ? 'Final slide · Back to builder to finish'
              : '← / → arrow keys to navigate'}
          </p>
        </div>
        <button
          className="tool-button primary-button"
          disabled={index === slides.length - 1}
          onClick={() => step(1)}
        >
          Next
          <ArrowRight size={17} />
        </button>
      </footer>
    </div>
  );
}
