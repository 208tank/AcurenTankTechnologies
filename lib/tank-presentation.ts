import { Section, TankType, Technology, sections, tankTypes } from './tank-data';
import { DEFAULT_EQUIPMENT, Equipment } from './equipment';
export type PresentationSlide = { technologyId: string; tankType: TankType; section: Section };
export const PRESENTATION_KEY = 'tankscope-presentation-v1';
/** An equipment slide placed in a presentation. */
export type EquipmentDeckItem = { equipmentId: string };
/** One entry in a presentation: a technology slide or an equipment slide. */
export type DeckItem = PresentationSlide | EquipmentDeckItem;
export const isEquipmentItem = (x: DeckItem): x is EquipmentDeckItem => 'equipmentId' in x;
const itemKey = (x: DeckItem) =>
  isEquipmentItem(x) ? `e:${x.equipmentId}` : `t:${x.technologyId}`;

/**
 * Read a saved presentation. Version 1 held technologies only; equipment
 * slides then always followed their technology, so they are added there.
 */
export function validatePresentation(value: unknown): DeckItem[] {
  const v = value as { version?: unknown; slides?: unknown };
  if (
    !v ||
    (v.version !== 1 && v.version !== 2) ||
    !Array.isArray(v.slides) ||
    v.slides.length > 1000
  )
    throw new Error('Saved presentation could not be read. Your library has not been changed.');
  const keys = new Set<string>();
  const out: DeckItem[] = [];
  const add = (x: DeckItem) => {
    if (keys.has(itemKey(x))) return;
    keys.add(itemKey(x));
    out.push(x);
  };
  for (const s of v.slides) {
    const raw = s as Record<string, unknown>;
    if (v.version === 2 && raw && typeof raw.equipmentId === 'string' && raw.equipmentId) {
      add({ equipmentId: raw.equipmentId.slice(0, 100) });
      continue;
    }
    const x = s as PresentationSlide;
    if (
      !x ||
      typeof x.technologyId !== 'string' ||
      !x.technologyId ||
      !tankTypes.some((t) => t.id === x.tankType) ||
      !sections.some((t) => t.id === x.section)
    )
      throw new Error(
        'Saved presentation contains invalid slides. Your library has not been changed.',
      );
    add({ technologyId: x.technologyId, tankType: x.tankType, section: x.section });
    if (v.version === 1)
      for (const e of DEFAULT_EQUIPMENT.filter((d) => d.technologyId === x.technologyId))
        add({ equipmentId: e.id });
  }
  return out;
}

export function serializePresentation(items: DeckItem[]) {
  return JSON.stringify({ version: 2, slides: items });
}

export type ResolvedTechSlide = ReturnType<typeof resolveSlides>[number];
export type ResolvedItem =
  | { kind: 'tech'; slide: ResolvedTechSlide }
  | { kind: 'equipment'; equipment: Equipment };

/** Turn a saved presentation into slides, skipping anything no longer in the library. */
export function resolveDeck(
  items: DeckItem[],
  data: Technology[],
  equipment: Equipment[],
): ResolvedItem[] {
  return items.flatMap((x): ResolvedItem[] => {
    if (isEquipmentItem(x)) {
      const e = equipment.find((q) => q.id === x.equipmentId);
      return e ? [{ kind: 'equipment', equipment: e }] : [];
    }
    return resolveSlides([x], data).map((slide) => ({ kind: 'tech', slide }));
  });
}

export function slideSections(t: Technology, type: TankType) {
  return t.sections.filter((s) => !(type === 'efr' && s === 'roof'));
}
export function slideTypes(t: Technology) {
  return t.tankTypes.filter((type) => slideSections(t, type).length > 0);
}
export function createSlide(t: Technology): PresentationSlide | null {
  const tankType = slideTypes(t)[0];
  if (!tankType) return null;
  return { technologyId: t.id, tankType, section: slideSections(t, tankType)[0] };
}
export function resolveSlides(slides: PresentationSlide[], data: Technology[]) {
  return slides.flatMap((s) => {
    const technology = data.find((t) => t.id === s.technologyId);
    if (!technology) return [];
    const types = slideTypes(technology);
    const tankType = types.includes(s.tankType) ? s.tankType : types[0];
    if (!tankType) return [];
    const allowed = slideSections(technology, tankType);
    const section = allowed.includes(s.section) ? s.section : allowed[0];
    return [{ ...s, tankType, section, technology }];
  });
}
export function moveSlide<T>(slides: T[], index: number, delta: number) {
  const target = index + delta;
  if (index < 0 || index >= slides.length || target < 0 || target >= slides.length) return slides;
  const result = [...slides];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
