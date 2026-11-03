'use client';
/* eslint-disable @next/next/no-img-element -- images can be browser-stored blobs */
import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Copy,
  Download,
  ImagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ScanLine,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_EQUIPMENT,
  Equipment,
  MAX_FEATURES,
  MAX_OUTPUTS,
  MAX_STATS,
  blankEquipment,
  imageRefs,
} from '@/lib/equipment';
import { prepareImage, putImage, useImageUrl } from '@/lib/image-store';
import { useTankData } from './use-tank-data';
import { useEquipment } from './use-equipment';
import AppHeader from './app-header';
import BrandFooter from './brand-footer';
import LibraryTabs from './library-tabs';
import EquipmentSlide from './equipment-slide';

function Thumb({ src, className }: { src: string; className?: string }) {
  const url = useImageUrl(src);
  return url ? (
    <img src={url} alt="" className={`h-full w-full object-cover ${className ?? ''}`} />
  ) : null;
}

/** A button that opens a file picker and hands back the processed image. */
function ImagePicker({
  label,
  onPicked,
  onError,
}: {
  label: string;
  onPicked: (ref: string) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      onPicked(await putImage(await prepareImage(file)));
    } catch (e) {
      console.error(e);
      onError(e instanceof Error ? e.message : 'Could not add that image.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="tool-button !py-2 text-xs"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <ImagePlus size={14} />
        {busy ? 'Processing…' : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}

export default function EquipmentLibrary() {
  const { data } = useTankData();
  const { items, ready, error, save, exportData, importData } = useEquipment();
  const [draft, setDraft] = useState<Equipment | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  const isNew = draft ? !items.some((e) => e.id === draft.id) : false;

  function confirmDiscard() {
    return !dirty || window.confirm('Discard unsaved changes to this equipment slide?');
  }
  function open(e: Equipment) {
    if (!confirmDiscard()) return;
    const stats = [...e.stats];
    while (stats.length < MAX_STATS) stats.push({ value: '', label: '' });
    setDraft({ ...e, stats, features: [...e.features], outputs: e.outputs.map((o) => ({ ...o })) });
    setDirty(false);
    setFormError('');
    setNotice('');
  }
  function close() {
    if (!confirmDiscard()) return;
    setDraft(null);
    setDirty(false);
  }
  function change(patch: Partial<Equipment>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) {
      setFormError('Give the equipment a name.');
      return;
    }
    const clean: Equipment = {
      ...draft,
      stats: draft.stats.filter((s) => s.value.trim() || s.label.trim()),
      features: draft.features.map((f) => f.trim()).filter(Boolean),
      outputs: draft.outputs.filter((o) => o.image),
    };
    const next = isNew ? [...items, clean] : items.map((x) => (x.id === clean.id ? clean : x));
    if (save(next)) {
      setDraft(null);
      setDirty(false);
      setNotice(`“${clean.name}” saved. Add it to a presentation from the presentation builder.`);
    }
  }
  function duplicate(e: Equipment) {
    if (!confirmDiscard()) return;
    const copy = { ...e, id: crypto.randomUUID(), name: `${e.name} (copy)` };
    if (save([...items, copy], draft ? imageRefs([draft]) : [])) {
      setNotice(`Duplicated as “${copy.name}”.`);
    }
  }
  function remove(e: Equipment) {
    if (!window.confirm(`Delete the “${e.name}” equipment slide? Presentations will skip it.`))
      return;
    if (
      save(
        items.filter((x) => x.id !== e.id),
        draft && draft.id !== e.id ? imageRefs([draft]) : [],
      )
    ) {
      if (draft?.id === e.id) {
        setDraft(null);
        setDirty(false);
      }
      setNotice(`“${e.name}” deleted.`);
    }
  }
  async function importFile(f?: File) {
    if (!f) return;
    if (
      !window.confirm(
        'Replace all equipment slides with this file? Export a backup first if needed.',
      )
    )
      return;
    if (await importData(f)) {
      setDraft(null);
      setDirty(false);
      setNotice('Equipment slides imported.');
    }
  }
  function resetDefaults() {
    if (
      !window.confirm(
        'Replace all equipment slides with the original FloormapX and MFE Mark IV slides? Your photos and edits will be removed.',
      )
    )
      return;
    if (save(DEFAULT_EQUIPMENT)) {
      setDraft(null);
      setDirty(false);
      setNotice('Default equipment slides restored.');
    }
  }

  const relatedName = (id: string) => data.find((t) => t.id === id)?.name;

  return (
    <div className="min-h-screen">
      <AppHeader manage />
      <main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8">
        <Link
          href="/"
          onClick={(e) => {
            if (!confirmDiscard()) e.preventDefault();
          }}
          className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft size={13} />
          Back to 3D explorer
        </Link>
        <div className="brand-intro mb-7">
          <div>
            <p className="eyebrow mb-2">Show the kit that does the work</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Equipment slides</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              A full-screen slide per scanner or tool: photo, headline specs, key features and
              example outputs. Place them anywhere in a presentation from the presentation builder.
            </p>
          </div>
        </div>
        <LibraryTabs active="equipment" />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {items.length} equipment {items.length === 1 ? 'slide' : 'slides'} · saved in this
            browser only, with their images. Use Export to back up or move them to another computer.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!ready}
              className="tool-button !py-2 text-xs"
              onClick={() => void exportData()}
            >
              <Download size={13} />
              Export
            </button>
            <button
              disabled={!ready}
              className="tool-button !py-2 text-xs"
              onClick={() => importInput.current?.click()}
            >
              <Upload size={13} />
              Import
            </button>
            <button disabled={!ready} className="tool-button !py-2 text-xs" onClick={resetDefaults}>
              <RotateCcw size={13} />
              Reset defaults
            </button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import equipment slides"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {(notice || error) && (
          <p
            role={error ? 'alert' : 'status'}
            className={`mb-5 rounded border p-3 text-sm ${error ? 'border-destructive text-destructive' : 'border-border bg-secondary'}`}
          >
            {error || notice}
          </p>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[360px_1fr]">
          <section aria-label="Equipment slides" className="space-y-3">
            <button
              className="tool-button primary-button w-full"
              disabled={!ready}
              onClick={() => open(blankEquipment())}
            >
              <Plus size={15} />
              New equipment slide
            </button>
            {items.map((e) => (
              <article
                key={e.id}
                className={`flex gap-3 rounded-lg border bg-card p-3 ${draft?.id === e.id ? 'border-primary' : 'border-border'}`}
              >
                <div className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-primary text-[var(--brand-cyan)]">
                  {e.photo ? <Thumb src={e.photo} /> : <ScanLine size={22} />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{e.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {[e.maker, relatedName(e.technologyId)].filter(Boolean).join(' · ') ||
                      'Equipment'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {e.photo ? 'Photo' : 'No photo'} · {e.outputs.length} output
                    {e.outputs.length === 1 ? '' : 's'}
                  </p>
                  <div className="mt-2 flex gap-1">
                    <button
                      className="tool-button !px-2 !py-1 text-xs"
                      onClick={() => open(e)}
                      aria-label={`Edit ${e.name}`}
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                    <button
                      className="tool-button !px-2 !py-1"
                      onClick={() => duplicate(e)}
                      aria-label={`Duplicate ${e.name}`}
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      className="tool-button !px-2 !py-1"
                      onClick={() => remove(e)}
                      aria-label={`Delete ${e.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          {draft ? (
            <form
              onSubmit={submit}
              aria-label="Equipment slide editor"
              className="rounded-xl border border-border bg-card"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="eyebrow mb-1">Equipment slide</p>
                  <h2 className="font-display text-lg font-semibold">
                    {isNew ? 'New equipment slide' : `Edit ${draft.name || 'equipment'}`}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close editor"
                  className="rounded p-2 hover:bg-secondary"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="border-b border-border bg-secondary/40 p-5">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Live preview</p>
                <div className="relative mx-auto aspect-video max-w-[900px] overflow-hidden rounded-md border border-border bg-white shadow-sm">
                  <EquipmentSlide
                    item={draft}
                    badge={
                      relatedName(draft.technologyId)
                        ? `${relatedName(draft.technologyId)} equipment`
                        : 'Equipment'
                    }
                  />
                </div>
              </div>

              <div className="grid gap-6 p-5 lg:grid-cols-2">
                <fieldset className="space-y-4">
                  <legend className="mb-3 text-sm font-semibold">Details</legend>
                  <label className="block text-xs">
                    <span className="mb-1.5 block font-medium">
                      Name <span className="text-primary">*</span>
                    </span>
                    <input
                      value={draft.name}
                      required
                      maxLength={80}
                      placeholder="e.g. FloormapX"
                      onChange={(e) => change({ name: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1.5 block font-medium">Maker</span>
                    <input
                      value={draft.maker}
                      maxLength={80}
                      placeholder="e.g. Eddyfi Technologies"
                      onChange={(e) => change({ maker: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1.5 block font-medium">One-line description</span>
                    <input
                      value={draft.tagline}
                      maxLength={140}
                      placeholder="What it is and why it matters"
                      onChange={(e) => change({ tagline: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1.5 block font-medium">Related technology</span>
                    <select
                      className="w-full rounded-md border border-input bg-background p-2 text-sm"
                      value={draft.technologyId}
                      onChange={(e) => change({ technologyId: e.target.value })}
                    >
                      <option value="">None</option>
                      {data.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.subtitle}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1.5 block text-[11px] text-muted-foreground">
                      Labels the slide, and places it after that technology in booth mode’s “All
                      technologies” loop.
                    </span>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1.5 block font-medium">
                      Key features (one per line, up to {MAX_FEATURES})
                    </span>
                    <textarea
                      rows={5}
                      value={draft.features.join('\n')}
                      onChange={(e) =>
                        change({ features: e.target.value.split('\n').slice(0, MAX_FEATURES) })
                      }
                    />
                  </label>
                </fieldset>

                <div className="space-y-6">
                  <fieldset>
                    <legend className="mb-3 text-sm font-semibold">
                      Headline specs (up to {MAX_STATS})
                    </legend>
                    <div className="space-y-2">
                      {draft.stats.map((s, i) => (
                        <div key={i} className="grid grid-cols-[120px_1fr] gap-2">
                          <input
                            aria-label={`Spec ${i + 1} value`}
                            placeholder="300 mm"
                            maxLength={40}
                            value={s.value}
                            onChange={(e) =>
                              change({
                                stats: draft.stats.map((x, j) =>
                                  j === i ? { ...x, value: e.target.value } : x,
                                ),
                              })
                            }
                          />
                          <input
                            aria-label={`Spec ${i + 1} label`}
                            placeholder="scan width"
                            maxLength={120}
                            value={s.label}
                            onChange={(e) =>
                              change({
                                stats: draft.stats.map((x, j) =>
                                  j === i ? { ...x, label: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="mb-3 text-sm font-semibold">Photo</legend>
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded bg-primary text-[var(--brand-cyan)]">
                        {draft.photo ? <Thumb src={draft.photo} /> : <ScanLine size={24} />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ImagePicker
                          label={draft.photo ? 'Replace photo' : 'Add photo'}
                          onPicked={(ref) => change({ photo: ref })}
                          onError={setFormError}
                        />
                        {draft.photo && (
                          <button
                            type="button"
                            className="tool-button !py-2 text-xs"
                            onClick={() => change({ photo: '' })}
                          >
                            <Trash2 size={13} />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      A landscape photo works best. Images are resized and location data is removed.
                    </p>
                  </fieldset>

                  <fieldset>
                    <legend className="mb-3 text-sm font-semibold">
                      Example outputs ({draft.outputs.length}/{MAX_OUTPUTS})
                    </legend>
                    <div className="space-y-3">
                      {draft.outputs.map((o, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 rounded border border-border p-2"
                        >
                          <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded border border-border bg-white">
                            <Thumb src={o.image} className="!object-contain" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <input
                              aria-label={`Output ${i + 1} caption`}
                              placeholder="e.g. Full floor map, 30 m tank"
                              maxLength={160}
                              value={o.caption}
                              onChange={(e) =>
                                change({
                                  outputs: draft.outputs.map((x, j) =>
                                    j === i ? { ...x, caption: e.target.value } : x,
                                  ),
                                })
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <ImagePicker
                                label="Replace image"
                                onPicked={(ref) =>
                                  change({
                                    outputs: draft.outputs.map((x, j) =>
                                      j === i ? { ...x, image: ref } : x,
                                    ),
                                  })
                                }
                                onError={setFormError}
                              />
                              <button
                                type="button"
                                className="tool-button !py-2 text-xs"
                                onClick={() =>
                                  change({ outputs: draft.outputs.filter((_, j) => j !== i) })
                                }
                              >
                                <Trash2 size={13} />
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {draft.outputs.length < MAX_OUTPUTS && (
                        <ImagePicker
                          label="Add output image"
                          onPicked={(ref) =>
                            change({ outputs: [...draft.outputs, { image: ref, caption: '' }] })
                          }
                          onError={setFormError}
                        />
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Floor maps, C-scans, report pages. Remove client and site names first.
                    </p>
                  </fieldset>
                </div>
              </div>

              {formError && (
                <p role="alert" className="mx-5 mb-4 text-xs text-destructive">
                  {formError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                <button type="button" onClick={close} className="tool-button">
                  Cancel
                </button>
                <button type="submit" className="tool-button primary-button">
                  <Save size={14} />
                  Save equipment slide
                </button>
              </div>
            </form>
          ) : (
            <aside className="rounded-xl border border-dashed border-input bg-card p-8 text-sm text-muted-foreground">
              <ScanLine size={26} className="mb-4 text-primary" />
              <p className="font-semibold text-foreground">
                Choose a slide to edit, or create a new one.
              </p>
              <p className="mt-2 max-w-xl text-xs leading-6">
                Duplicate an existing slide to use it as a template. To show a slide, tick it under
                “Equipment slides” in the{' '}
                <Link href="/present" className="underline">
                  presentation builder
                </Link>{' '}
                and move it where you want it.
              </p>
            </aside>
          )}
        </div>
      </main>
      <BrandFooter />
    </div>
  );
}
