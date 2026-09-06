import { useMemo, useState } from 'react';
import { Check, Circle, FileDown, ListChecks, Loader2, Square, Trash2, X } from 'lucide-react';
import { useRegionStore } from '@/store/useRegionStore';
import { RegionListItem } from './RegionListItem';
import { ChurchBuildingPanel } from './ChurchBuildingPanel';

interface Props {
  onExport: () => void;
  isExporting: boolean;
}

export function Sidebar({ onExport, isExporting }: Props) {
  const regions = useRegionStore((s) => s.project.regions);
  const setAllSelected = useRegionStore((s) => s.setAllSelected);
  const selectAllPending = useRegionStore((s) => s.selectAllPending);
  const removeRegion = useRegionStore((s) => s.removeRegion);
  const removeRegions = useRegionStore((s) => s.removeRegions);

  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending');
  const [deleteMode, setDeleteMode] = useState(false);
  const [markedForDelete, setMarkedForDelete] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const sorted = [...regions].sort((a, b) => b.createdAt - a.createdAt);
    if (filter === 'all') return sorted;
    return sorted.filter((r) => r.status === filter);
  }, [regions, filter]);

  const pendingCount = regions.filter((r) => r.status === 'pending').length;
  const doneCount = regions.filter((r) => r.status === 'done').length;
  const selectedCount = regions.filter((r) => r.selectedForPdf).length;

  const toggleDeleteMark = (id: string): void => {
    setMarkedForDelete((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const enterDeleteMode = (): void => {
    setDeleteMode(true);
    setMarkedForDelete(new Set());
  };

  const exitDeleteMode = (): void => {
    setDeleteMode(false);
    setMarkedForDelete(new Set());
  };

  const markAllFiltered = (): void => {
    setMarkedForDelete(new Set(filtered.map((r) => r.id)));
  };

  const confirmBulkDelete = (): void => {
    if (markedForDelete.size === 0) return;
    const count = markedForDelete.size;
    if (confirm(`Delete ${count} region${count === 1 ? '' : 's'}? This cannot be undone.`)) {
      removeRegions(Array.from(markedForDelete));
      exitDeleteMode();
    }
  };

  return (
    <aside className="flex w-[480px] flex-col border-l border-gray-200 bg-panel">
      <ChurchBuildingPanel />
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Regions</h2>
          <span className="text-xs text-muted">{regions.length} total</span>
        </div>
        <div className="mt-2 flex gap-1 text-xs">
          <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>
            Pending ({pendingCount})
          </FilterChip>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            All ({regions.length})
          </FilterChip>
          <FilterChip active={filter === 'done'} onClick={() => setFilter('done')}>
            Done ({doneCount})
          </FilterChip>
        </div>
      </header>

      {deleteMode ? (
        <div className="flex items-center gap-1 border-b border-gray-200 bg-red-50 px-3 py-2 text-xs">
          <SmallBtn onClick={markAllFiltered} icon={<Check size={14} />}>
            All
          </SmallBtn>
          <SmallBtn
            onClick={() => setMarkedForDelete(new Set())}
            icon={<Square size={14} />}
          >
            None
          </SmallBtn>
          <div className="ml-auto flex items-center gap-1">
            {markedForDelete.size > 0 && (
              <button
                type="button"
                onClick={confirmBulkDelete}
                className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                <Trash2 size={13} />
                Delete {markedForDelete.size}
              </button>
            )}
            <SmallBtn onClick={exitDeleteMode} icon={<X size={14} />}>
              Cancel
            </SmallBtn>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs">
          <SmallBtn onClick={selectAllPending} icon={<ListChecks size={14} />}>
            Select all pending
          </SmallBtn>
          <SmallBtn onClick={() => setAllSelected(true)} icon={<Check size={14} />}>
            All
          </SmallBtn>
          <SmallBtn onClick={() => setAllSelected(false)} icon={<Square size={14} />}>
            None
          </SmallBtn>
          <div className="ml-auto">
            <SmallBtn onClick={enterDeleteMode} icon={<Trash2 size={14} />}>
              Multi-delete
            </SmallBtn>
          </div>
        </div>
      )}

      <div className="thin-scroll flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <RegionListItem
                key={r.id}
                region={r}
                deleteMode={deleteMode}
                markedForDelete={markedForDelete.has(r.id)}
                onToggleDeleteMark={() => toggleDeleteMark(r.id)}
                onDelete={() => {
                  if (confirm(`Delete region "${r.addressShort ?? r.address}"?`)) removeRegion(r.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-gray-200 bg-gray-50 px-3 py-3 text-sm">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>{selectedCount} selected for PDF</span>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/60"
        >
          {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {isExporting
            ? 'Exporting…'
            : selectedCount > 0
              ? `Export ${selectedCount} region${selectedCount === 1 ? '' : 's'}`
              : 'Export all pending'}
        </button>
      </footer>
    </aside>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center text-sm text-muted">
      <Circle size={28} className="opacity-40" />
      <p>No regions yet.</p>
      <p>
        Click <span className="font-medium text-ink">Draw Region</span>, click vertices around a
        block, double-click to finish, then drop a pin on a house.
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls = active
    ? 'bg-accent/10 text-accent'
    : 'text-muted hover:bg-gray-100';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

function SmallBtn({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-muted transition-colors hover:bg-gray-100 hover:text-ink"
    >
      {icon}
      {children}
    </button>
  );
}
