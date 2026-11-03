'use client';
import { useEffect, useState } from 'react';
import { asset } from './base-path';

/**
 * Images added in the app (equipment photos and outputs) are kept in the
 * browser's IndexedDB, which holds far more than localStorage. They are
 * referenced from saved data as "idb:<id>"; anything else is a path in public/.
 */
const DB = 'tankscope';
const STORE = 'images';
export const IDB_PREFIX = 'idb:';

export const isStoredRef = (ref?: string) => !!ref && ref.startsWith(IDB_PREFIX);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = t.onabort = () => {
      db.close();
      reject(t.error || req.error);
    };
  });
}

export async function putImage(blob: Blob, id = crypto.randomUUID()): Promise<string> {
  await tx('readwrite', (s) => s.put(blob, id));
  return IDB_PREFIX + id;
}

export async function getImage(ref: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(ref.slice(IDB_PREFIX.length)));
}

/** Delete stored images that no saved item references any more. */
export async function deleteUnusedImages(keep: Set<string>) {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  const unused = keys.map(String).filter((k) => !keep.has(IDB_PREFIX + k));
  for (const k of unused) await tx('readwrite', (s) => s.delete(k));
}

/**
 * Shrink an uploaded image and re-encode it. Re-encoding also drops photo
 * metadata such as GPS location. Screenshots (PNG) stay PNG when small enough
 * to keep text crisp; everything else becomes JPEG.
 */
export async function prepareImage(file: File, maxSide = 1920): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPG or PNG).');
  if (file.size > 40_000_000) throw new Error('That image is over 40 MB. Choose a smaller one.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This image format isn’t supported here. Save it as JPG or PNG and try again.');
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))),
        type,
        quality,
      ),
    );
  if (file.type === 'image/png') {
    const png = await encode('image/png');
    if (png.size < 2_500_000) return png;
  }
  return encode('image/jpeg', 0.88);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(url)) throw new Error('Invalid image data.');
  return (await fetch(url)).blob();
}

/** A displayable URL for an image reference (stored image or public path). */
export function useImageUrl(ref?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(
    ref && !isStoredRef(ref) ? asset(ref) : undefined,
  );
  useEffect(() => {
    if (!ref) {
      setUrl(undefined);
      return;
    }
    if (!isStoredRef(ref)) {
      setUrl(asset(ref));
      return;
    }
    let objectUrl: string | undefined;
    let cancelled = false;
    setUrl(undefined);
    getImage(ref)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ref]);
  return url;
}
