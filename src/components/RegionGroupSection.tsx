import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, FolderOpen, FolderPlus, Square, Ungroup } from 'lucide-react';
import type { MapGroup, Region } from '@/types/region';
import { useRegionStore } from '@/store/useRegionStore';
import { RegionListItem } from './RegionListItem';

interface Props {
  group: MapGroup;
  members: Region[];
  deleteMode: boolean;
  markedForDelete: Set<string>;
  onSelectClick: (id: string, shiftKey: boolean) => void;
  onToggleDeleteMark: (id: string, shiftKey: boolean) => void;
  onMarkMembers: (ids: string[], marked: boolean) => void;
  onDeleteRegion: (region: Region) => void;
}

export function RegionGroupSection({
  group,
  members,
  deleteMode,
  markedForDelete,
  onSelectClick,
  onToggleDeleteMark,
  onMarkMembers,
  onDeleteRegion,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [name, setName] = useState(group.name);
  const toggleGroupSelected = useRegionStore((s) => s.toggleGroupSelected);
  const renameGroup = useRegionStore((s) => s.renameGroup);
  const ungroup = useRegionStore((s) => s.ungroup);
  const addSelectedToGroup = useRegionStore((s) => s.addSelectedToGroup);
  const setHoveredGroupId = useRegionStore((s) => s.setHoveredGroupId);
  const allRegions = useRegionStore((s) => s.project.regions);

  useEffect(() => {
    setName(group.name);
  }, [group.name]);

  const allSelected = members.length > 0 && members.every((r) => r.selectedForPdf);
  const someSelected = members.some((r) => r.selectedForPdf);
  const allMarked = members.length > 0 && members.every((r) => markedForDelete.has(r.id));
  const selectedOutside = allRegions.filter((r) => r.selectedForPdf && r.groupId !== group.id);
  const canAddSelected = !deleteMode && selectedOutside.length > 0;

  const commitName = (): void => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(group.name);
      return;
    }
    if (trimmed !== group.name) renameGroup(group.id, trimmed);
  };

  return (
    <section className="border-b border-gray-100">
      <div
        onMouseEnter={() => setHoveredGroupId(group.id)}
        onMouseLeave={() => setHoveredGroupId(null)}
        className={`group flex items-center gap-1.5 px-3 py-2 ${
          deleteMode
            ? allMarked
              ? 'bg-red-50'
              : 'bg-red-50/40'
            : allSelected
              ? 'bg-accent/10'
              : 'bg-gray-50'
        }`}
      >
        {deleteMode ? (
          <button
            type="button"
            onClick={() => onMarkMembers(members.map((m) => m.id), !allMarked)}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              allMarked
                ? 'border-red-500 bg-red-500 text-white'
                : 'border-gray-300 bg-white hover:border-red-400'
            }`}
            aria-label={allMarked ? 'Unmark group for deletion' : 'Mark group for deletion'}
          >
            {allMarked && <Check size={14} />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => toggleGroupSelected(group.id)}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              allSelected
                ? 'border-accent bg-accent text-white'
                : someSelected
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-gray-300 bg-white hover:border-accent'
            }`}
            aria-label={allSelected ? 'Deselect group for PDF' : 'Select group for PDF'}
          >
            {allSelected ? <Check size={14} /> : someSelected ? <Square size={10} fill="currentColor" /> : null}
          </button>
        )}

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded p-0.5 text-muted hover:bg-gray-200 hover:text-ink"
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        <FolderOpen size={14} className="shrink-0 text-accent" />

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(group.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-ink hover:border-gray-200 focus:border-accent focus:bg-white focus:outline-none"
          aria-label="Group name"
        />

        <span className="shrink-0 text-[11px] tabular-nums text-muted">
          {members.length} map{members.length === 1 ? '' : 's'}
        </span>

        {!deleteMode && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {canAddSelected && (
              <button
                type="button"
                onClick={() => addSelectedToGroup(group.id)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/10"
                title="Add selected maps to this group"
              >
                <FolderPlus size={12} />
                Add
              </button>
            )}
            <button
              type="button"
              onClick={() => ungroup(group.id)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-gray-200 hover:text-ink"
              title="Ungroup maps"
            >
              <Ungroup size={12} />
              Ungroup
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <ul className="divide-y divide-gray-100">
          {members.map((r) => (
            <RegionListItem
              key={r.id}
              region={r}
              nested
              deleteMode={deleteMode}
              markedForDelete={markedForDelete.has(r.id)}
              onSelectClick={onSelectClick}
              onToggleDeleteMark={(shiftKey) => onToggleDeleteMark(r.id, shiftKey)}
              onDelete={() => onDeleteRegion(r)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
