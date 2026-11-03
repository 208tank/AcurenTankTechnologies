/**
 * Equipment slides: a full-width slide per scanner, shown right after the
 * technology it belongs to (in presentations and in booth mode).
 *
 * Images live in public/equipment/<id>/. Leave `photo` empty and `outputs`
 * empty until real images are available; the slide still renders.
 * Specs are the manufacturers' published figures.
 */
export type EquipmentOutput = { image: string; caption: string };

export type Equipment = {
  id: string;
  technologyId: string;
  maker: string;
  name: string;
  tagline: string;
  /** Headline numbers, shown as large tiles (keep to 4). */
  stats: { value: string; label: string }[];
  features: string[];
  /** Path under public/, e.g. '/equipment/floormapx/photo.jpg'. */
  photo?: string;
  photoAlt?: string;
  /** Example outputs and reports (keep to 3). */
  outputs: EquipmentOutput[];
};

export const equipment: Equipment[] = [
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
    outputs: [],
  },
];

export function equipmentFor(technologyId: string): Equipment[] {
  return equipment.filter((e) => e.technologyId === technologyId);
}
