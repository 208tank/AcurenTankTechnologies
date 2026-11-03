'use client';
import { useEffect, useState } from 'react';
import { defaults, Technology, validateLibrary } from '@/lib/tank-data';
const KEY = 'tankscope-library-v1';
export function useTankData() {
  const [data, setData] = useState<Technology[]>(defaults);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        setData(raw ? validateLibrary(JSON.parse(raw)) : defaults);
        setError('');
      } catch (e) {
        console.error(e);
        setError(
          'Saved content could not be read. Defaults are shown; export or repair your saved content before replacing it.',
        );
      }
      setReady(true);
    }
    load();
    window.addEventListener('storage', load);
    return () => window.removeEventListener('storage', load);
  }, []);
  function save(next: Technology[]) {
    try {
      const valid = validateLibrary(next);
      localStorage.setItem(KEY, JSON.stringify(valid));
      setData(valid);
      setError('');
      return true;
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Could not save content in this browser.');
      return false;
    }
  }
  function exportData() {
    try {
      const blob = new Blob([JSON.stringify({ version: 1, technologies: data }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tankscope-library.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError('Export failed. Please try again.');
    }
  }
  async function importData(file: File) {
    try {
      if (file.size > 5000000) throw new Error('Choose a JSON file smaller than 5 MB.');
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed) && parsed?.version !== 1)
        throw new Error('Unsupported library version.');
      return save(validateLibrary(Array.isArray(parsed) ? parsed : parsed?.technologies));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Invalid JSON file.');
      return false;
    }
  }
  return { data, ready, error, save, exportData, importData };
}
