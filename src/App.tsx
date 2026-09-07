import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { MapView } from './components/MapView';
import { StatusBar } from './components/StatusBar';
import { useRegionStore } from './store/useRegionStore';
import { useProjectIO } from './hooks/useProjectIO';
import { useAutosave } from './hooks/useAutosave';

export default function App() {
  const mode = useRegionStore((s) => s.mode);
  const setMode = useRegionStore((s) => s.setMode);
  const undo = useRegionStore((s) => s.undo);
  const redo = useRegionStore((s) => s.redo);
  const ensureUniqueRegionColors = useRegionStore((s) => s.ensureUniqueRegionColors);
  const { openProject, saveProject, saveProjectAs, exportPdf, openPdfFolder, lastPdfPath, isExporting } = useProjectIO();
  useAutosave();

  // Fix projects that reused colours across distant clusters (legacy pickColor).
  useEffect(() => {
    ensureUniqueRegionColors();
  }, [ensureUniqueRegionColors]);

  useEffect(() => {
    const offOpen = window.api.onMenu('open', openProject);
    const offSave = window.api.onMenu('save', saveProject);
    const offSaveAs = window.api.onMenu('saveAs', saveProjectAs);
    const offExport = window.api.onMenu('exportPdf', () => exportPdf());
    return () => {
      offOpen();
      offSave();
      offSaveAs();
      offExport();
    };
  }, [openProject, saveProject, saveProjectAs, exportPdf]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && mode !== 'idle') {
        setMode('idle');
        return;
      }
      // Undo/redo for region edits. Ignore when typing in a field so the
      // browser's native text undo/redo still works there.
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        const isUndo = key === 'z' && !e.shiftKey;
        const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
        if (isUndo || isRedo) {
          const target = e.target as HTMLElement | null;
          const tag = target?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
          e.preventDefault();
          if (isRedo) redo();
          else undo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, setMode, undo, redo]);

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <Toolbar
        onOpen={openProject}
        onSave={saveProject}
        onSaveAs={saveProjectAs}
        onOpenPdfFolder={openPdfFolder}
        hasPdfFolder={!!lastPdfPath}
      />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          <MapView />
        </div>
        <Sidebar onExport={() => exportPdf()} isExporting={isExporting} />
      </div>
      <StatusBar />
    </div>
  );
}
