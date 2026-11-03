import { Technology, sections } from './tank-data';
import { Equipment } from './equipment';
import {
  PresentationSlide,
  ResolvedItem,
  ResolvedTechSlide,
  createSlide,
  resolveSlides,
} from './tank-presentation';

/** Booth display options, saved per browser. */
export type BoothSettings = {
  /** 'deck' plays the saved presentation; 'all' cycles every technology. */
  source: 'deck' | 'all';
  /** Seconds each technology stays on screen. */
  seconds: number;
  /** Show the contact card after this many technologies (0 = never). */
  contactEvery: number;
};

export const BOOTH_KEY = 'tankscope-booth-v1';
export const SECONDS_OPTIONS = [10, 15, 20, 30];
export const CONTACT_OPTIONS = [0, 3, 5, 8];
export const DEFAULT_BOOTH: BoothSettings = { source: 'deck', seconds: 15, contactEvery: 5 };

export function readBoothSettings(raw: string | null): BoothSettings {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<BoothSettings>) : {};
    return {
      source: v.source === 'all' ? 'all' : 'deck',
      seconds: SECONDS_OPTIONS.includes(v.seconds as number)
        ? (v.seconds as number)
        : DEFAULT_BOOTH.seconds,
      contactEvery: CONTACT_OPTIONS.includes(v.contactEvery as number)
        ? (v.contactEvery as number)
        : DEFAULT_BOOTH.contactEvery,
    };
  } catch {
    return DEFAULT_BOOTH;
  }
}

/** Every technology, grouped by tank section (floor up to rim seal). */
export function allTechnologySlides(data: Technology[]): PresentationSlide[] {
  const order = sections.map((s) => s.id);
  return data
    .map(createSlide)
    .filter((s): s is PresentationSlide => s !== null)
    .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}

export type BoothTechSlide = ResolvedTechSlide;
export type BoothSlide =
  | { kind: 'tech'; slide: BoothTechSlide }
  | { kind: 'equipment'; equipment: Equipment }
  | { kind: 'contact' };

/** Every technology, each followed by the equipment slides related to it. */
export function allTechnologyItems(data: Technology[], equipment: Equipment[]): ResolvedItem[] {
  return resolveSlides(allTechnologySlides(data), data).flatMap((slide): ResolvedItem[] => [
    { kind: 'tech', slide },
    ...equipment
      .filter((e) => e.technologyId === slide.technology.id)
      .map((e): ResolvedItem => ({ kind: 'equipment', equipment: e })),
  ]);
}

/**
 * The looping sequence: a contact card first, then the slides, with a contact
 * card after every `contactEvery` technologies (placed after that technology's
 * equipment slides, never between them). The loop itself restarts on the
 * opening contact card, so none is added at the very end.
 */
export function boothSequence(items: ResolvedItem[], contactEvery: number): BoothSlide[] {
  const out: BoothSlide[] = [];
  if (contactEvery > 0) out.push({ kind: 'contact' });
  let techCount = 0;
  let due = false;
  for (const item of items) {
    if (due && item.kind === 'tech') {
      out.push({ kind: 'contact' });
      due = false;
    }
    out.push(item);
    if (item.kind === 'tech' && contactEvery > 0 && ++techCount % contactEvery === 0) due = true;
  }
  return out;
}
