/**
 * Equipment slides: a full-width slide per piece of equipment (a scanner, a
 * crawler…), edited in Library → Equipment slides and placed anywhere in a
 * presentation.
 *
 * Images are either stored in the browser ("idb:<id>", see lib/image-store)
 * or a path in public/ such as '/equipment/floormapx/photo.jpg'.
 */
export type EquipmentOutput = { image: string; caption: string };
export type EquipmentStat = { value: string; label: string };

export type Equipment = {
  id: string;
  /** Optional related technology; booth "All technologies" shows it after that one. */
  technologyId: string;
  maker: string;
  name: string;
  tagline: string;
  /** Headline numbers, shown as large tiles (up to 4). */
  stats: EquipmentStat[];
  /** Key points (up to 5). */
  features: string[];
  photo: string;
  /** Example outputs and reports (up to 3). */
  outputs: EquipmentOutput[];
};

export const MAX_STATS = 4;
export const MAX_FEATURES = 5;
export const MAX_OUTPUTS = 3;
export const EQUIPMENT_KEY = 'tankscope-equipment-v1';

export const DEFAULT_EQUIPMENT: Equipment[] = [
  {
    id: 'floormapx',
    technologyId: 'mfl',
    maker: 'Eddyfi Technologies',
    name: 'FloormapX',
    tagline: 'MFL array floor scanner that tells topside from soil-side corrosion',
    stats: [
      { value: '300 mm', label: 'scan width' },
      { value: '263 m²/h', label: 'scanning productivity' },
      { value: '4.7–18 mm', label: 'plate mapping & sizing' },
      { value: '10 mm', label: 'max. non-magnetic coating' },
    ],
    features: [
      '128 multi-oriented MFL sensors in a 64-channel array',
      'STARS sensors separate topside from soil-side corrosion, and metal loss from weld spatter',
      'Motor-assisted drive; scans to within 12 mm of the shell',
      'Live C-scan while scanning; reports aligned with API 653 and EEMUA 159',
    ],
    photo: '',
    outputs: [],
  },
  {
    id: 'mfe-mark-iv',
    technologyId: 'mfl',
    maker: 'MFE Inspection Solutions',
    name: 'MFE Mark IV',
    tagline: 'Rugged 12-channel MFL floor scanner with automatic floor mapping',
    stats: [
      { value: '300 mm', label: 'scan width' },
      { value: '1.1 m/s', label: 'max. scan speed' },
      { value: '6–12.7 mm', label: 'plate thickness (up to 20 mm with High Flux Bridge)' },
      { value: '12.7 mm', label: 'max. non-magnetic coating' },
    ],
    features: [
      '24-coil, 12-channel sensor with speed compensation',
      'Live A-scan with C-scan preview, plus an alarm-on-defect mode',
      'Sketch-based mapping draws the tank floor plan automatically',
      'Reports export to editable Word files with photos and comments',
    ],
    photo: '',
    outputs: [],
  },
];

export function blankEquipment(): Equipment {
  return {
    id: crypto.randomUUID(),
    technologyId: '',
    maker: '',
    name: '',
    tagline: '',
    stats: [
      { value: '', label: '' },
      { value: '', label: '' },
      { value: '', label: '' },
      { value: '', label: '' },
    ],
    features: [],
    photo: '',
    outputs: [],
  };
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const imageRef = (v: unknown) => {
  const s = str(v, 200);
  return s.startsWith('idb:') || s.startsWith('/') ? s : '';
};

/** Validate saved or imported equipment; drops unknown fields. */
export function validateEquipment(value: unknown): Equipment[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new Error('Equipment data must be a list of up to 200 slides.');
  const ids = new Set<string>();
  return value.map((raw) => {
    const v = (raw ?? {}) as Record<string, unknown>;
    const id = str(v.id, 100);
    if (!id || ids.has(id)) throw new Error('Each equipment slide needs a unique ID.');
    ids.add(id);
    if (!str(v.name).trim()) throw new Error('Each equipment slide needs a name.');
    return {
      id,
      technologyId: str(v.technologyId, 100),
      maker: str(v.maker),
      name: str(v.name),
      tagline: str(v.tagline),
      stats: (Array.isArray(v.stats) ? v.stats : []).slice(0, MAX_STATS).map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return { value: str(o.value, 40), label: str(o.label, 120) };
      }),
      features: (Array.isArray(v.features) ? v.features : [])
        .slice(0, MAX_FEATURES)
        .map((f) => str(f))
        .filter(Boolean),
      photo: imageRef(v.photo),
      outputs: (Array.isArray(v.outputs) ? v.outputs : [])
        .slice(0, MAX_OUTPUTS)
        .map((o) => {
          const x = (o ?? {}) as Record<string, unknown>;
          return { image: imageRef(x.image), caption: str(x.caption, 160) };
        })
        .filter((o) => o.image),
    };
  });
}

/** Every stored-image reference used by these slides. */
export function imageRefs(items: Equipment[]): string[] {
  return items.flatMap((e) => [e.photo, ...e.outputs.map((o) => o.image)]).filter(Boolean);
}

/** Stats and features with blanks removed, as shown on the slide. */
export function visibleStats(e: Equipment) {
  return e.stats.filter((s) => s.value.trim() || s.label.trim());
}
