'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_EQUIPMENT,
  EQUIPMENT_KEY,
  Equipment,
  imageRefs,
  validateEquipment,
} from '@/lib/equipment';
import {
  blobToDataUrl,
  dataUrlToBlob,
  deleteUnusedImages,
  getImage,
  isStoredRef,
  putImage,
} from '@/lib/image-store';

/** Equipment slides saved in this browser (falls back to the defaults). */
export function useEquipment() {
  const [items, setItems] = useState<Equipment[]>(DEFAULT_EQUIPMENT);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function load() {
      try {
        const raw = localStorage.getItem(EQUIPMENT_KEY);
        setItems(raw ? validateEquipment(JSON.parse(raw)?.items) : DEFAULT_EQUIPMENT);
        setError('');
      } catch (e) {
        console.error(e);
        setError('Saved equipment slides could not be read. Defaults are shown.');
      }
      setReady(true);
    }
    load();
    window.addEventListener('storage', load);
    return () => window.removeEventListener('storage', load);
  }, []);

  /**
   * Save the list. Stored images nothing uses any more are deleted, except
   * `keep` (images in a slide that is still being edited).
   */
  const save = useCallback((next: Equipment[], keep: string[] = []) => {
    try {
      const valid = validateEquipment(next);
      localStorage.setItem(EQUIPMENT_KEY, JSON.stringify({ version: 1, items: valid }));
      setItems(valid);
      setError('');
      void deleteUnusedImages(new Set([...imageRefs(valid), ...keep])).catch((e) =>
        console.error(e),
      );
      return true;
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Could not save equipment slides in this browser.');
      return false;
    }
  }, []);

  /** Download every equipment slide, with its images embedded. */
  async function exportData() {
    try {
      const images: Record<string, string> = {};
      for (const ref of imageRefs(items)) {
        if (!isStoredRef(ref) || images[ref]) continue;
        const blob = await getImage(ref);
        if (blob) images[ref] = await blobToDataUrl(blob);
      }
      const blob = new Blob([JSON.stringify({ version: 1, equipment: items, images })], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tankscope-equipment.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError('Export failed. Please try again.');
    }
  }

  /** Replace all equipment slides with an exported file. */
  async function importData(file: File) {
    try {
      if (file.size > 200_000_000) throw new Error('Choose a file smaller than 200 MB.');
      const parsed = JSON.parse(await file.text());
      if (parsed?.version !== 1 || !Array.isArray(parsed?.equipment))
        throw new Error('This isn’t a TankScope equipment export.');
      const list = validateEquipment(parsed.equipment);
      const images = (parsed.images ?? {}) as Record<string, unknown>;
      const remap = new Map<string, string>();
      for (const ref of imageRefs(list)) {
        if (!isStoredRef(ref) || remap.has(ref)) continue;
        const data = images[ref];
        if (typeof data !== 'string') throw new Error('The file is missing some of its images.');
        remap.set(ref, await putImage(await dataUrlToBlob(data)));
      }
      const fix = (ref: string) => remap.get(ref) ?? ref;
      return save(
        list.map((e) => ({
          ...e,
          photo: fix(e.photo),
          outputs: e.outputs.map((o) => ({ ...o, image: fix(o.image) })),
        })),
      );
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Invalid equipment file.');
      return false;
    }
  }

  return { items, ready, error, save, exportData, importData };
}
