import { useEffect, useRef } from 'react';
import { useRegionStore } from '@/store/useRegionStore';
import { serializeProject } from '@/lib/projectFile';

const DEBOUNCE_MS = 1500;

export function useAutosave(): void {
  const project = useRegionStore((s) => s.project);
  const filePath = useRegionStore((s) => s.filePath);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const json = serializeProject(project);
      window.api.autosaveProject(json, filePath).catch(() => {});
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [project, filePath]);
}
