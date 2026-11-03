'use client';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, MonitorPlay, Play, WifiOff } from 'lucide-react';
import { sections, tankTypes } from '@/lib/tank-data';
import {
  PRESENTATION_KEY,
  PresentationSlide,
  resolveSlides,
  validatePresentation,
} from '@/lib/tank-presentation';
import {
  BOOTH_KEY,
  BoothSettings,
  BoothSlide,
  CONTACT_OPTIONS,
  DEFAULT_BOOTH,
  SECONDS_OPTIONS,
  allTechnologySlides,
  boothSequence,
  readBoothSettings,
} from '@/lib/booth';
import { asset } from '@/lib/base-path';
import { useOfflineSupport } from '@/lib/offline';
import { useTankData } from './use-tank-data';
import AppHeader from './app-header';
import BrandFooter from './brand-footer';

const TankViewer = dynamic(() => import('./tank-viewer'), { ssr: false });
const noop = () => {};

const WEBSITE = 'www.acuren.com';
const PHONE = '1-800-218-7450';

export default function BoothMode() {
  const { data, ready } = useTankData();
  const offline = useOfflineSupport();
  const [deck, setDeck] = useState<PresentationSlide[]>([]);
  const [settings, setSettings] = useState<BoothSettings>(DEFAULT_BOOTH);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESENTATION_KEY);
      if (raw) setDeck(validatePresentation(JSON.parse(raw)));
    } catch (e) {
      console.error(e);
    }
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(BOOTH_KEY);
    } catch (e) {
      console.error(e);
    }
    setSettings(readBoothSettings(saved));
    setLoaded(true);
    if (new URLSearchParams(location.search).get('autostart') === '1') setRunning(true);
  }, []);

  function update(patch: Partial<BoothSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      localStorage.setItem(BOOTH_KEY, JSON.stringify(next));
    } catch (e) {
      console.error(e);
    }
  }

  const deckSlides = useMemo(() => resolveSlides(deck, data), [deck, data]);
  const allSlides = useMemo(() => resolveSlides(allTechnologySlides(data), data), [data]);
  const useDeck = settings.source === 'deck' && deckSlides.length > 0;
  const techSlides = useDeck ? deckSlides : allSlides;
  const sequence = useMemo(
    () => boothSequence(techSlides, settings.contactEvery),
    [techSlides, settings.contactEvery],
  );
  const loopSeconds = sequence.length * settings.seconds;

  async function start() {
    try {
      await document.documentElement.requestFullscreen();
    } catch (e) {
      // Blocked (e.g. inside a preview frame); the loop still runs in the window.
      console.error(e);
    }
    setRunning(true);
  }

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(console.error);
    setRunning(false);
  }, []);

  if (running && ready && loaded && sequence.length)
    return <BoothPlayer sequence={sequence} seconds={settings.seconds} onExit={exit} />;

  return (
    <div className="min-h-screen">
      <AppHeader present />
      <main className="mx-auto max-w-[1100px] px-5 py-10 md:px-8">
        <Link
          href="/present"
          className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back to presentation builder
        </Link>
        <div className="brand-intro mb-8">
          <div>
            <p className="eyebrow mb-2">Trade show display</p>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Booth mode
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Loops technologies full screen on a TV with no one at the controls. The tank model
              turns slowly and highlights the section each technology inspects, with a contact card
              in between.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <section className="space-y-6 rounded-xl border border-border bg-card p-6">
            <fieldset>
              <legend className="mb-3 text-sm font-semibold">What to show</legend>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                  <input
                    type="radio"
                    name="source"
                    className="mt-1"
                    disabled={!deckSlides.length}
                    checked={useDeck}
                    onChange={() => update({ source: 'deck' })}
                  />
                  <span>
                    <span className="block font-medium">
                      My presentation ({deckSlides.length}{' '}
                      {deckSlides.length === 1 ? 'technology' : 'technologies'})
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {deckSlides.length ? (
                        'Plays the technologies and order chosen in the presentation builder.'
                      ) : (
                        <>
                          Nothing selected yet.{' '}
                          <Link href="/present" className="underline">
                            Build a presentation
                          </Link>{' '}
                          in this browser to use it here.
                        </>
                      )}
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary">
                  <input
                    type="radio"
                    name="source"
                    className="mt-1"
                    checked={!useDeck}
                    onChange={() => update({ source: 'all' })}
                  />
                  <span>
                    <span className="block font-medium">All technologies ({allSlides.length})</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      The whole library, from floor to rim seal.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-2 block font-semibold">Time per technology</span>
                <select
                  className="w-full rounded-md border border-input bg-background p-2"
                  value={settings.seconds}
                  onChange={(e) => update({ seconds: Number(e.target.value) })}
                >
                  {SECONDS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-2 block font-semibold">Contact card</span>
                <select
                  className="w-full rounded-md border border-input bg-background p-2"
                  value={settings.contactEvery}
                  onChange={(e) => update({ contactEvery: Number(e.target.value) })}
                >
                  {CONTACT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? 'Never' : `After every ${n} technologies`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
              <p className="text-xs text-muted-foreground">
                {techSlides.length} technologies · full loop {Math.floor(loopSeconds / 60)} min{' '}
                {loopSeconds % 60} s
              </p>
              <button
                className="tool-button primary-button !px-6 !py-3 text-sm"
                disabled={!ready || !loaded || !sequence.length}
                onClick={start}
              >
                <Play size={16} />
                Start booth mode
              </button>
            </div>
          </section>

          <aside className="space-y-4 self-start">
            <OfflineCard status={offline} />
            <div className="rounded-xl border border-border bg-card p-5 text-xs leading-6 text-muted-foreground">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <MonitorPlay size={16} className="text-primary" />
                At the booth
              </p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Turn off sleep and the screen saver on the computer driving the TV.</li>
                <li>
                  Press <kbd>F11</kbd> as well, so the browser stays full screen even if the page
                  reloads.
                </li>
                <li>
                  While it runs: <kbd>Space</kbd> pauses, <kbd>←</kbd>/<kbd>→</kbd> step,{' '}
                  <kbd>Esc</kbd> returns here.
                </li>
                <li>
                  To start automatically, open{' '}
                  <span className="break-all font-mono text-[11px]">booth/?autostart=1</span>.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      <BrandFooter />
    </div>
  );
}

function OfflineCard({ status }: { status: ReturnType<typeof useOfflineSupport> }) {
  const ok = status.state === 'ready';
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-xs leading-6 text-muted-foreground">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        {ok ? <Check size={16} className="text-primary" /> : <WifiOff size={16} />}
        {ok ? 'Ready to run offline' : 'Offline use'}
      </p>
      {status.state === 'ready' && (
        <p>
          This browser has saved the site ({status.files} files), so booth mode keeps running if the
          venue wifi drops.
        </p>
      )}
      {status.state === 'pending' && <p>Saving the site to this browser for offline use…</p>}
      {status.state === 'unsupported' && (
        <p>Offline saving isn’t available here. Keep the booth computer online.</p>
      )}
      {status.state === 'error' && (
        <p>Couldn’t save the site for offline use. Keep the booth computer online.</p>
      )}
    </div>
  );
}

type PlayerProps = { sequence: BoothSlide[]; seconds: number; onExit: () => void };

function BoothPlayer({ sequence, seconds, onExit }: PlayerProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [idle, setIdle] = useState(false);
  const current = sequence[index % sequence.length];
  // The model keeps showing the most recent technology while a contact card is up.
  const lastTech = useMemo(() => {
    for (let i = 0; i < sequence.length; i++) {
      const s = sequence[(index - i + sequence.length) % sequence.length];
      if (s.kind === 'tech') return s.slide;
    }
    return null;
  }, [sequence, index]);

  const step = useCallback(
    (delta: number) => setIndex((i) => (i + delta + sequence.length) % sequence.length),
    [sequence.length],
  );

  // Advance on a timer.
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => step(1), seconds * 1000);
    return () => window.clearTimeout(t);
  }, [index, paused, seconds, step]);

  // Keyboard controls.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') step(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') step(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'Escape') onExit();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [step, onExit]);

  // Hide the mouse pointer when it isn't moving.
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), 2500);
    function move() {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), 2500);
    }
    window.addEventListener('mousemove', move);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('mousemove', move);
    };
  }, []);

  // Keep the screen from sleeping while the loop runs.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    async function acquire() {
      try {
        if (document.visibilityState === 'visible' && !stopped)
          lock = await navigator.wakeLock.request('screen');
      } catch (e) {
        console.warn('Screen wake lock unavailable; turn off sleep in system settings.', e);
      }
    }
    function visible() {
      if (document.visibilityState === 'visible') void acquire();
    }
    void acquire();
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', visible);
      void lock?.release().catch(() => {});
    };
  }, []);

  const tech = lastTech?.technology;
  const section = sections.find((s) => s.id === lastTech?.section);
  const tankType = tankTypes.find((t) => t.id === lastTech?.tankType);
  const techNumber = sequence.slice(0, index + 1).filter((s) => s.kind === 'tech').length;
  const techTotal = sequence.filter((s) => s.kind === 'tech').length;

  return (
    <div className={`booth ${idle ? 'booth-idle' : ''}`}>
      <header className="booth-top">
        <div className="booth-logo">
          <Image src={asset('/branding/acuren-logo.svg')} alt="Acuren" fill unoptimized priority />
        </div>
        <p className="booth-title">Tank Integrity Services</p>
        <p className="booth-count">
          {current.kind === 'tech' ? `${techNumber} / ${techTotal}` : ''}
          {paused && <span className="booth-paused">Paused</span>}
        </p>
      </header>

      <main className="booth-main">
        <section className="booth-stage viewer-stage" aria-hidden="true">
          {lastTech && (
            <TankViewer
              type={lastTech.tankType}
              cutaway={lastTech.section !== 'shell' && lastTech.section !== 'roof'}
              selected={lastTech.section}
              onSelect={noop}
              reset={0}
              labels
              autoRotate
            />
          )}
          {section && tankType && (
            <div className="booth-chip">
              <span>{section.name}</span>
              {tankType.name}
            </div>
          )}
        </section>

        {tech && current.kind === 'tech' && (
          <article key={index} className="booth-copy animate-fade-in">
            <p className="booth-eyebrow">{section?.name} inspection</p>
            <h1 className="booth-name">{tech.name}</h1>
            <p className="booth-subtitle">{tech.subtitle}</p>
            <p className="booth-description">{tech.description}</p>
            <div className="booth-points">
              {tech.detects && (
                <div>
                  <h2>What it finds</h2>
                  <p>{tech.detects}</p>
                </div>
              )}
              {tech.advantages && (
                <div>
                  <h2>Why it helps</h2>
                  <p>{tech.advantages}</p>
                </div>
              )}
            </div>
          </article>
        )}

        {current.kind === 'contact' && (
          <article key={index} className="booth-contact animate-fade-in">
            <div>
              <p className="booth-eyebrow">Acuren Tank Integrity Services</p>
              <h1 className="booth-contact-title">
                The right inspection for every part of your tank.
              </h1>
              <p className="booth-contact-text">
                Talk to our team about your aboveground storage tank inspection program.
              </p>
              <p className="booth-contact-line">{WEBSITE}</p>
              <p className="booth-contact-line">{PHONE}</p>
            </div>
            <figure className="booth-qr">
              <Image
                src={asset('/branding/qr-acuren-website.svg')}
                alt={`QR code for ${WEBSITE}`}
                fill
                unoptimized
              />
              <figcaption>Scan to visit {WEBSITE}</figcaption>
            </figure>
          </article>
        )}
      </main>

      <footer className="booth-bottom">
        <div
          key={`${index}-${paused}`}
          className="booth-progress"
          style={{
            animationDuration: `${seconds}s`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
        <span>{WEBSITE}</span>
        <span className="booth-divider" aria-hidden="true">
          |
        </span>
        <span>{PHONE}</span>
      </footer>
    </div>
  );
}
