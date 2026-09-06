import { useEffect, useState } from 'react';
import {
  FolderOpen,
  Save,
  Pencil,
  MousePointer2,
  FileSignature,
  FolderSearch,
  Maximize2,
  Minimize2,
  Flame,
  Church,
} from 'lucide-react';
import { useRegionStore } from '@/store/useRegionStore';
import { AddressSearch } from './AddressSearch';

interface Props {
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenPdfFolder: () => void;
  hasPdfFolder: boolean;
}

export function Toolbar({ onOpen, onSave, onSaveAs, onOpenPdfFolder, hasPdfFolder }: Props) {
  const mode = useRegionStore((s) => s.mode);
  const setMode = useRegionStore((s) => s.setMode);
  const dirty = useRegionStore((s) => s.dirty);
  const heatmapEnabled = useRegionStore((s) => s.heatmapEnabled);
  const setHeatmapEnabled = useRegionStore((s) => s.setHeatmapEnabled);
  const heatmapCap = useRegionStore((s) => s.heatmapCap);
  const setHeatmapCap = useRegionStore((s) => s.setHeatmapCap);
  const churchPin = useRegionStore((s) => s.project.churchPin);
  const beginPlaceChurchPin = useRegionStore((s) => s.beginPlaceChurchPin);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const off = window.api.onFullscreenChange(setIsFullscreen);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F11') { e.preventDefault(); void window.api.toggleFullscreen(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { off(); window.removeEventListener('keydown', onKey); };
  }, []);

  const drawing = mode === 'drawing';
  const placingChurch = mode === 'church-pin';

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 bg-panel px-3 py-2 shadow-panel">
      <ToolBtn onClick={onOpen} icon={<FolderOpen size={16} />} label="Open" />
      <ToolBtn onClick={onSave} icon={<Save size={16} />} label="Save" />
      <ToolBtn onClick={onSaveAs} icon={<FileSignature size={16} />} label="Save As" />
      <Divider />
      <ToolBtn
        onClick={() => setMode(drawing ? 'idle' : 'drawing')}
        icon={<Pencil size={16} />}
        label={drawing ? 'Stop Drawing' : 'Draw Region'}
        active={drawing}
      />
      <ToolBtn
        onClick={() => setMode('idle')}
        icon={<MousePointer2 size={16} />}
        label="Select"
        active={mode === 'idle'}
      />
      <ToolBtn
        onClick={() => (placingChurch ? setMode('idle') : beginPlaceChurchPin())}
        icon={<Church size={16} />}
        label={
          churchPin
            ? placingChurch
              ? 'Cancel Church'
              : 'Move Church'
            : placingChurch
              ? 'Cancel Church'
              : 'Set Church'
        }
        active={placingChurch}
        title={
          churchPin
            ? 'Click the map to move the church building pin'
            : 'Click the map to place the church building pin (or use address search)'
        }
      />
      <Divider />
      <AddressSearch />
      <Divider />
      <ToolBtn
        onClick={() => setHeatmapEnabled(!heatmapEnabled)}
        icon={<Flame size={16} />}
        label={heatmapEnabled ? 'Heatmap: On' : 'Heatmap'}
        active={heatmapEnabled}
      />
      <label
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
          heatmapEnabled ? 'text-ink' : 'text-muted opacity-60'
        }`}
        title="Cap the heatmap scale: regions ≥ this value render as the max color. Leave blank for auto."
      >
        <span>Cap</span>
        <input
          type="number"
          min={1}
          step={1}
          value={heatmapCap ?? ''}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === '') return setHeatmapCap(null);
            const n = Number(raw);
            setHeatmapCap(Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
          }}
          disabled={!heatmapEnabled}
          placeholder="auto"
          className="w-16 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-ink focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
        />
      </label>
      {hasPdfFolder && (
        <>
          <Divider />
          <ToolBtn onClick={onOpenPdfFolder} icon={<FolderSearch size={16} />} label="Open PDF Folder" />
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        <ToolBtn
          onClick={() => void window.api.toggleFullscreen()}
          icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="font-medium text-ink">Soulwinning Maps</span>
        {dirty && <span className="text-amber-600">•&nbsp;unsaved</span>}
      </div>
    </div>
  );
}

function ToolBtn({
  onClick,
  icon,
  label,
  active,
  primary,
  disabled,
  title,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors';
  let cls = `${base} text-ink hover:bg-gray-100`;
  if (active) cls = `${base} bg-accent/10 text-accent hover:bg-accent/15`;
  if (primary) cls = `${base} bg-accent text-white hover:bg-accent/90`;
  if (disabled) cls = `${base} bg-accent/60 text-white cursor-not-allowed`;
  return (
    <button type="button" onClick={onClick} className={cls} disabled={disabled} title={title}>
      {icon}
      {label}
    </button>
  );
}

function Divider() {
  return <span className="mx-2 h-6 w-px bg-gray-200" />;
}
