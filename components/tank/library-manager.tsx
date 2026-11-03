'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Search,
  Download,
  Upload,
  Copy,
  Trash2,
  RotateCcw,
  Save,
  X,
  FilePlus2,
  Check,
  Info,
} from 'lucide-react';
import { Technology, Section, TankType, defaults, sections, tankTypes } from '@/lib/tank-data';
import { useTankData } from './use-tank-data';
import AppHeader from './app-header';
import BrandFooter from './brand-footer';
import LibraryTabs from './library-tabs';
const fields: {
  key:
    | 'name'
    | 'subtitle'
    | 'description'
    | 'detects'
    | 'howItWorks'
    | 'advantages'
    | 'limitations'
    | 'imageUrl'
    | 'notes';
  label: string;
  placeholder: string;
  long?: boolean;
}[] = [
  { key: 'name', label: 'Technology name', placeholder: 'e.g. Magnetic flux leakage' },
  {
    key: 'subtitle',
    label: 'Short label / subtitle',
    placeholder: 'e.g. Floor corrosion screening',
  },
  {
    key: 'description',
    label: 'Description',
    placeholder: 'A short overview of this technology.',
    long: true,
  },
  {
    key: 'detects',
    label: 'What it detects',
    placeholder: 'Defects, conditions or features it can identify.',
    long: true,
  },
  {
    key: 'howItWorks',
    label: 'How it works',
    placeholder: 'Explain the inspection principle.',
    long: true,
  },
  {
    key: 'advantages',
    label: 'Advantages',
    placeholder: 'Where this method adds value.',
    long: true,
  },
  {
    key: 'limitations',
    label: 'Limitations & considerations',
    placeholder: 'Coverage, access, qualification and confirmation requirements.',
    long: true,
  },
  { key: 'imageUrl', label: 'Reference image URL (optional)', placeholder: 'https://…' },
  {
    key: 'notes',
    label: 'Presenter notes (optional)',
    placeholder: 'Your talking points or application-specific notes.',
    long: true,
  },
];
function blank(): Technology {
  return {
    id: crypto.randomUUID(),
    name: '',
    subtitle: '',
    description: '',
    detects: '',
    howItWorks: '',
    advantages: '',
    limitations: '',
    sections: ['floor'],
    tankTypes: ['ifr', 'efr', 'insulated'],
    suggested: false,
    imageUrl: '',
    notes: '',
  };
}
export default function LibraryManager() {
  const { data, ready, error, save, exportData, importData } = useTankData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Section | 'all'>('all');
  const [editing, setEditing] = useState<Technology | null>(null);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [dirty, setDirty] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const filtered = data.filter(
    (t) =>
      (filter === 'all' || t?.sections?.includes(filter)) &&
      `${t?.name} ${t?.subtitle}`.toLowerCase().includes(query.toLowerCase()),
  );
  function start(t: Technology) {
    if (dirty && !window.confirm('Discard unsaved form changes?')) return;
    setEditing({ ...t, sections: [...(t?.sections ?? [])], tankTypes: [...(t?.tankTypes ?? [])] });
    setFormError('');
    setDirty(false);
  }
  function close() {
    if (!dirty || window.confirm('Discard unsaved form changes?')) {
      setEditing(null);
      setDirty(false);
    }
  }
  function update(key: string, value: unknown) {
    setEditing((v) => (v ? { ...v, [key]: value } : null));
    setDirty(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (
      !editing?.name?.trim() ||
      !editing?.description?.trim() ||
      !editing?.sections?.length ||
      !editing?.tankTypes?.length
    ) {
      setFormError(
        'Add a name and description, and select at least one section and tank configuration.',
      );
      return;
    }
    const next = data.some((t) => t.id === editing.id)
      ? data.map((t) => (t.id === editing.id ? editing : t))
      : [...data, editing];
    if (save(next)) {
      setNotice('Technology saved. Your changes are available in the 3D explorer.');
      setDirty(false);
      setEditing(null);
    }
  }
  function remove(t: Technology) {
    if (window.confirm(`Delete “${t.name}” from your library?`)) {
      if (save(data.filter((x) => x.id !== t.id))) {
        setNotice('Technology deleted.');
        if (editing?.id === t.id) {
          setEditing(null);
          setDirty(false);
        }
      }
    }
  }
  async function importFile(f?: File) {
    if (!f) return;
    if (
      !window.confirm(
        'Replace your current library with this JSON file? Export a backup first if needed.',
      )
    )
      return;
    if (await importData(f)) {
      setEditing(null);
      setDirty(false);
      setNotice('Library imported successfully.');
    }
  }
  return (
    <div className="min-h-screen">
      <AppHeader manage />
      <main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8">
        <Link
          href="/"
          onClick={(e) => {
            if (dirty && !window.confirm('Leave without saving your changes?')) e.preventDefault();
          }}
          className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft size={13} />
          Back to 3D explorer
        </Link>
        <div className="brand-intro mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Your inspection knowledge, organized</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Technology library
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Build your presentation toolkit. Edit a method, duplicate it, or start with a blank
              template.
            </p>
          </div>
          <button
            disabled={!ready}
            onClick={() => start(blank())}
            className="tool-button primary-button"
          >
            <Plus size={15} />
            New technology
          </button>
        </div>
        <LibraryTabs active="technologies" />
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {data.length} technologies<span className="mx-2 text-border">|</span>Saved in this
            browser only
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!ready}
              className="tool-button !bg-transparent !py-2"
              onClick={exportData}
            >
              <Download size={13} />
              Export JSON
            </button>
            <button
              disabled={!ready}
              className="tool-button !bg-transparent !py-2"
              onClick={() => file.current?.click()}
            >
              <Upload size={13} />
              Import JSON
            </button>
            <button
              disabled={!ready}
              className="tool-button !bg-transparent !py-2"
              onClick={() => {
                if (
                  window.confirm(
                    'Reset the entire library to defaults? Your custom entries and edits will be replaced. Export a backup first.',
                  )
                ) {
                  if (save(defaults)) {
                    setEditing(null);
                    setDirty(false);
                    setNotice('Default technology library restored.');
                  }
                }
              }}
            >
              <RotateCcw size={13} />
              Reset defaults
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import technology JSON"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {(notice || error) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`mb-5 flex items-center justify-between rounded-lg border border-border bg-secondary p-3 text-xs ${error ? 'text-destructive' : 'text-primary'}`}
          >
            <span className="flex items-center gap-2">
              <Check size={14} />
              {error || notice}
            </span>
            {!error && (
              <button aria-label="Dismiss message" onClick={() => setNotice('')}>
                <X size={14} />
              </button>
            )}
          </div>
        )}
        <div
          className={`grid gap-6 ${editing ? 'lg:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_300px]'}`}
        >
          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap gap-3">
              <div className="relative min-w-[200px] flex-1">
                <Search size={15} className="absolute left-3 top-3 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search technology library"
                  placeholder="Search the library…"
                  className="!pl-9"
                />
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Section | 'all')}
                aria-label="Filter by section"
                className="rounded-md border border-input bg-card px-3 text-xs"
              >
                <option value="all">All sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex justify-between border-b border-border px-4 py-3">
                <span className="eyebrow">Technology / Application</span>
                <span className="eyebrow">{filtered.length} entries</span>
              </div>
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 border-b border-border p-4 last:border-0 ${editing?.id === t.id ? 'bg-primary/5' : ''}`}
                >
                  <button onClick={() => start(t)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {t.name}
                      {t.suggested && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[8px] font-normal uppercase tracking-wide text-muted-foreground">
                          Suggested
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.subtitle}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.sections.map((s) => (
                        <span
                          key={s}
                          className="rounded border border-border px-1.5 py-0.5 text-[9px] capitalize text-muted-foreground"
                        >
                          {s === 'floating' ? 'Floating roof' : s}
                        </span>
                      ))}
                      <span className="self-center text-[9px] text-muted-foreground">
                        {t.tankTypes
                          .map((x) => (x === 'insulated' ? 'Insulated' : x.toUpperCase()))
                          .join(' / ')}
                      </span>
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() =>
                        start({ ...t, id: crypto.randomUUID(), name: `${t.name} (copy)` })
                      }
                      className="rounded p-2 text-muted-foreground hover:bg-secondary hover:text-primary"
                      title="Duplicate technology"
                      aria-label={`Duplicate ${t.name}`}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      onClick={() => remove(t)}
                      className="rounded p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      title="Delete technology"
                      aria-label={`Delete ${t.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
              {!filtered.length && (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  No technologies match your search.
                </p>
              )}
            </div>
          </section>
          {editing ? (
            <section
              className="self-start rounded-xl border border-border bg-card"
              aria-label="Technology template editor"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="eyebrow mb-1">Technology template</p>
                  <h2 className="font-display text-lg font-semibold">
                    {data.some((t) => t.id === editing.id) ? 'Edit technology' : 'New technology'}
                  </h2>
                </div>
                <button
                  onClick={close}
                  aria-label="Close editor"
                  className="rounded p-2 hover:bg-secondary"
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={submit} className="space-y-4 p-5">
                {fields.map((f) => (
                  <label key={f.key} className="block text-xs">
                    <span className="mb-2 block font-medium">
                      {f.label}
                      {['name', 'description'].includes(f.key) && (
                        <span className="ml-1 text-primary">*</span>
                      )}
                    </span>
                    {f.long ? (
                      <textarea
                        required={f.key === 'description'}
                        value={editing?.[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => update(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        required={f.key === 'name'}
                        type={f.key === 'imageUrl' ? 'url' : 'text'}
                        value={editing?.[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => update(f.key, e.target.value)}
                      />
                    )}
                  </label>
                ))}
                <fieldset>
                  <legend className="mb-2 text-xs font-medium">Tank sections *</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {sections.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={editing.sections.includes(s.id)}
                          onChange={(e) =>
                            update(
                              'sections',
                              e.target.checked
                                ? [...editing.sections, s.id]
                                : editing.sections.filter((x) => x !== s.id),
                            )
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-xs font-medium">
                    Applicable tank configurations *
                  </legend>
                  <div className="space-y-2">
                    {tankTypes.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={editing.tankTypes.includes(t.id)}
                          onChange={(e) =>
                            update(
                              'tankTypes',
                              e.target.checked
                                ? [...editing.tankTypes, t.id]
                                : editing.tankTypes.filter((x) => x !== t.id),
                            )
                          }
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={editing.suggested}
                    onChange={(e) => update('suggested', e.target.checked)}
                  />
                  Mark as a suggested addition
                </label>
                {formError && (
                  <p role="alert" className="text-xs text-destructive">
                    {formError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                  <button type="button" onClick={close} className="tool-button">
                    Cancel
                  </button>
                  <button type="submit" className="tool-button primary-button">
                    <Save size={14} />
                    Save technology
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <aside className="self-start rounded-xl border border-dashed border-input bg-card p-6">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FilePlus2 size={22} />
              </div>
              <h2 className="font-display text-lg font-semibold">Start with a blank canvas.</h2>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Your template includes the inspection principle, detectable conditions, advantages,
                limitations, tank types and presenter notes.
              </p>
              <button
                onClick={() => start(blank())}
                className="tool-button primary-button mt-5 w-full"
              >
                <Plus size={14} />
                Use blank template
              </button>
              <div className="mt-7 border-t border-border pt-5">
                <p className="flex items-center gap-2 text-xs font-medium">
                  <Info size={14} className="text-primary" />
                  Take it to your next talk
                </p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Export your library as JSON, then import it on another laptop. Browser data is
                  local—not synced between devices. Back up before clearing site data.
                </p>
              </div>
            </aside>
          )}
        </div>
      </main>
      <BrandFooter />
    </div>
  );
}
