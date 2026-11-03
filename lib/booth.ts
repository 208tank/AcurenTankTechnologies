import { Technology, sections } from './tank-data';
import { PresentationSlide, createSlide, resolveSlides } from './tank-presentation';

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

export type BoothTechSlide = ReturnType<typeof resolveSlides>[number];
export type BoothSlide = { kind: 'tech'; slide: BoothTechSlide } | { kind: 'contact' };

/**
 * The looping sequence: a contact card first, then technologies with a contact
 * card after every `contactEvery` of them.
 */
export function boothSequence(slides: BoothTechSlide[], contactEvery: number): BoothSlide[] {
  const out: BoothSlide[] = [];
  if (contactEvery > 0) out.push({ kind: 'contact' });
  slides.forEach((slide, i) => {
    out.push({ kind: 'tech', slide });
    const last = i === slides.length - 1;
    if (contactEvery > 0 && (i + 1) % contactEvery === 0 && !last) out.push({ kind: 'contact' });
  });
  return out;
}
