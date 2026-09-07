import { useState } from 'react';
import { Check, Crosshair, FolderMinus, Loader2, MapPin, Trash2 } from 'lucide-react';
import type { Region } from '@/types/region';
import { useRegionStore } from '@/store/useRegionStore';
import { ColorPicker } from './ColorPicker';

interface Props {
  region: Region;
  onDelete: () => void;
  deleteMode?: boolean;
  markedForDelete?: boolean;
  /** Called with whether Shift was held — used for range select/mark. */
  onSelectClick?: (id: string, shiftKey: boolean) => void;
  onToggleDeleteMark?: (shiftKey: boolean) => void;
  nested?: boolean;
}

const DONE_COLOR = '#6B7280';

export function RegionListItem({
  region: r,
  onDelete,
  deleteMode = false,
  markedForDelete = false,
  onSelectClick,
  onToggleDeleteMark,
  nested = false,
}: Props) {
  const toggleSelected = useRegionStore((s) => s.toggleSelected);
  const updateRegion = useRegionStore((s) => s.updateRegion);
  const setRegionStatus = useRegionStore((s) => s.setRegionStatus);
  const setRegionColor = useRegionStore((s) => s.setRegionColor);
  const setHoveredRegionId = useRegionStore((s) => s.setHoveredRegionId);
  const beginRepositionPin = useRegionStore((s) => s.beginRepositionPin);
  const removeRegionFromGroup = useRegionStore((s) => s.removeRegionFromGroup);
  const mode = useRegionStore((s) => s.mode);
  const pendingPinForRegionId = useRegionStore((s) => s.pendingPinForRegionId);
  const isGeocoding = useRegionStore((s) => s.geocodingIds.has(r.id));
  const [pickerOpen, setPickerOpen] = useState(false);

  const isDone = r.status === 'done';
  const swatch = isDone ? DONE_COLOR : r.color;

  return (
    <li
      onMouseEnter={() => setHoveredRegionId(r.id)}
      onMouseLeave={() => setHoveredRegionId(null)}
      className={`group flex items-start gap-2 py-2.5 transition-colors ${
        nested ? 'border-l-2 border-accent/30 pl-7 pr-3' : 'px-3'
      } ${
        deleteMode
          ? markedForDelete
            ? 'bg-red-50'
            : 'hover:bg-red-50/40'
          : r.selectedForPdf
            ? 'bg-accent/5'
            : 'hover:bg-gray-50'
      }`}
    >
      {deleteMode ? (
        <button
          type="button"
          onMouseDown={(e) => {
            if (e.shiftKey) e.preventDefault();
          }}
          onClick={(e) => onToggleDeleteMark?.(e.shiftKey)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
            markedForDelete
              ? 'border-red-500 bg-red-500 text-white'
              : 'border-gray-300 bg-white hover:border-red-400'
          }`}
          aria-label="Mark for deletion"
          title="Click to mark · Shift+click for range"
        >
          {markedForDelete && <Check size={14} />}
        </button>
      ) : (
        <button
          type="button"
          onMouseDown={(e) => {
            if (e.shiftKey) e.preventDefault();
          }}
          onClick={(e) => {
            if (onSelectClick) onSelectClick(r.id, e.shiftKey);
            else toggleSelected(r.id);
          }}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
            r.selectedForPdf
              ? 'border-accent bg-accent text-white'
              : 'border-gray-300 bg-white hover:border-accent'
          }`}
          aria-label="Toggle selection for PDF"
          title="Click to select · Shift+click for range"
        >
          {r.selectedForPdf && <Check size={14} />}
        </button>
      )}

      <div className="flex shrink-0 flex-col gap-0.5" title="Souls saved for this map">
        <label htmlFor={`souls-${r.id}`} className="text-[10px] font-medium leading-none text-muted">
          Souls saved
        </label>
        <input
          id={`souls-${r.id}`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={r.soulsSaved}
          aria-label="Souls saved count"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateRegion(r.id, { soulsSaved: 0 });
              return;
            }
            const v = parseInt(raw, 10);
            if (!Number.isFinite(v)) return;
            updateRegion(r.id, { soulsSaved: Math.max(0, v) });
          }}
          className="w-[3.25rem] rounded border border-gray-300 bg-white py-0.5 pl-1 pr-0.5 text-center text-xs tabular-nums text-ink"
        />
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={isDone}
          title={isDone ? undefined : swatch}
          className="mt-0.5 h-6 w-6 rounded border border-gray-300 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: swatch }}
          aria-label="Change color"
        />
        {pickerOpen && !isDone && (
          <ColorPicker
            current={r.color}
            onPick={(c) => {
              setRegionColor(r.id, c, true);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm font-medium text-ink">
          <MapPin size={14} className="shrink-0 text-muted" />
          <span className="truncate" title={r.address}>
            {r.addressShort ?? r.address}
          </span>
          {isGeocoding && <Loader2 size={12} className="shrink-0 animate-spin text-muted" />}
        </div>
        {r.address && r.addressShort && r.address !== r.addressShort && (
          <div className="mt-0.5 truncate text-xs text-muted" title={r.address}>
            {r.address}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {r.pin && (
          <button
            type="button"
            onClick={() => beginRepositionPin(r.id)}
            disabled={mode === 'pin-drop' && pendingPinForRegionId === r.id}
            className="rounded p-1 text-muted transition-colors hover:bg-gray-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            title="Move pin to a new spot on the map"
            aria-label="Move pin"
          >
            <Crosshair size={14} />
          </button>
        )}
        {nested && r.groupId && !deleteMode && (
          <button
            type="button"
            onClick={() => removeRegionFromGroup(r.id)}
            className="rounded p-1 text-muted transition-colors hover:bg-gray-100 hover:text-ink"
            title="Remove from group"
            aria-label="Remove from group"
          >
            <FolderMinus size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setRegionStatus(r.id, isDone ? 'pending' : 'done')}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            isDone
              ? 'bg-success/10 text-success hover:bg-success/20'
              : 'bg-gray-100 text-muted hover:bg-success/10 hover:text-success'
          }`}
          title={isDone ? 'Mark as pending' : 'Mark as done'}
        >
          {isDone ? '✓ Done' : 'Done?'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
          aria-label="Delete region"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
