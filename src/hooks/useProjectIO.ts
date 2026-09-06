import { useCallback, useEffect, useState } from 'react';
import { useRegionStore } from '@/store/useRegionStore';
import { parseProject, serializeProject } from '@/lib/projectFile';
import { exportRegionsToPdf } from '@/lib/pdfExport';

export function useProjectIO() {
  const project = useRegionStore((s) => s.project);
  const satelliteBasemap = useRegionStore((s) => s.project.satelliteBasemap);
  const filePath = useRegionStore((s) => s.filePath);
  const loadProject = useRegionStore((s) => s.loadProject);
  const setFilePath = useRegionStore((s) => s.setFilePath);
  const markClean = useRegionStore((s) => s.markClean);
  const [lastPdfPath, setLastPdfPath] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const openProject = useCallback(async () => {
    const result = await window.api.openProject();
    if (!result) return;
    try {
      const parsed = parseProject(result.json);
      loadProject(parsed, result.path);
    } catch (e) {
      alert(`Failed to open project: ${(e as Error).message}`);
    }
  }, [loadProject]);

  // Auto-load the default project on first launch
  useEffect(() => {
    window.api.loadDefaultProject().then((result) => {
      if (!result) return;
      try {
        const parsed = parseProject(result.json);
        loadProject(parsed, result.path);
      } catch {
        // Silently ignore if the default file is missing or malformed
      }
    });
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProject = useCallback(async () => {
    const json = serializeProject(project);
    const path = await window.api.saveProject(json, filePath);
    if (path) {
      setFilePath(path);
      markClean();
    }
  }, [project, filePath, setFilePath, markClean]);

  const saveProjectAs = useCallback(async () => {
    const json = serializeProject(project);
    const suggested = `${project.name.replace(/\s+/g, '_')}.canvass.json`;
    const path = await window.api.saveProjectAs(json, suggested);
    if (path) {
      setFilePath(path);
      markClean();
    }
  }, [project, setFilePath, markClean]);

  const exportPdf = useCallback(
    async (opts?: { includeDone?: boolean }) => {
      const selected = project.regions.filter((r) => r.selectedForPdf);
      const target =
        selected.length > 0
          ? selected
          : project.regions.filter((r) => (opts?.includeDone ? true : r.status === 'pending'));

      if (target.length === 0) {
        alert('No regions to export. Select regions or add a pending region.');
        return;
      }

      setIsExporting(true);
      try {
        const bytes = await exportRegionsToPdf(target, {
          satelliteBasemap,
          churchPin: project.churchPin,
        });
        const today = new Date().toISOString().slice(0, 10);
        const defaultName = `Soulwinning-Maps_${today}.pdf`;
        const savedPath = await window.api.exportPdf(bytes, defaultName);
        if (savedPath) setLastPdfPath(savedPath);
      } catch (e) {
        alert(`PDF export failed: ${(e as Error).message}`);
      } finally {
        setIsExporting(false);
      }
    },
    [project, satelliteBasemap],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const json = serializeProject(project);
      window.api.autosaveProject(json, filePath);
    }, 10_000);
    return () => clearInterval(id);
  }, [project, filePath]);

  const openPdfFolder = useCallback(() => {
    if (lastPdfPath) window.api.showFileInFolder(lastPdfPath);
  }, [lastPdfPath]);

  return { openProject, saveProject, saveProjectAs, exportPdf, openPdfFolder, lastPdfPath, isExporting };
}
