import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { LatLng, Project, Region, RegionStatus } from '@/types/region';
import { emptyProject } from '@/types/region';
import { pickColor, assignUniqueColors } from '@/lib/colorPalette';
import { MapGroupManager } from '@/lib/mapGroups';

export type AppMode = 'idle' | 'drawing' | 'pin-drop' | 'church-pin';

/** Max number of project snapshots kept for undo. */
const MAX_HISTORY = 50;

interface RegionState {
  project: Project;
  filePath: string | null;
  dirty: boolean;
  /** Past project snapshots for undo (most recent last). */
  history: Project[];
  /** Future project snapshots for redo (most recent undo last). Cleared on any new edit. */
  future: Project[];

  mode: AppMode;
  pendingPinForRegionId: string | null;
  /** UI-only: region currently hovered in the sidebar, used to highlight it on the map. */
  hoveredRegionId: string | null;
  /** UI-only: group header hovered in the sidebar, highlights every member on the map. */
  hoveredGroupId: string | null;
  geocodingIds: Set<string>;
  /** UI-only: when true, polygons are filled with a heatmap color based on soulsSaved. */
  heatmapEnabled: boolean;
  /** UI-only: optional cap for the heatmap scale; values ≥ cap render as max color. null = auto. */
  heatmapCap: number | null;
  /** UI-only: temporary pin from address search; not part of the project. */
  searchMarker: LatLng | null;

  setMode: (m: AppMode) => void;
  setHoveredRegionId: (id: string | null) => void;
  setHoveredGroupId: (id: string | null) => void;
  setHeatmapEnabled: (value: boolean) => void;
  setHeatmapCap: (value: number | null) => void;
  loadProject: (p: Project, path: string | null) => void;
  /** Reassign unlocked region colours so each is unique across the project. */
  ensureUniqueRegionColors: () => void;
  setFilePath: (path: string) => void;
  markClean: () => void;
  /** Revert to the previous project snapshot. No-op when history is empty. */
  undo: () => void;
  /** Re-apply the most recently undone snapshot. No-op when future is empty. */
  redo: () => void;
  /** Whether there is at least one snapshot to undo to. */
  canUndo: () => boolean;
  /** Whether there is at least one snapshot to redo to. */
  canRedo: () => boolean;

  addRegion: (polygon: LatLng[]) => Region;
  updateRegion: (id: string, patch: Partial<Region>) => void;
  removeRegion: (id: string) => void;
  removeRegions: (ids: string[]) => void;
  setRegionPin: (id: string, pin: LatLng) => void;
  /** Enter pin-drop for an existing pin so the user can click a new location. */
  beginRepositionPin: (id: string) => void;
  setRegionAddress: (id: string, address: string, short?: string) => void;
  setRegionColor: (id: string, color: string, locked?: boolean) => void;
  setRegionStatus: (id: string, status: RegionStatus) => void;
  toggleSelected: (id: string) => void;
  setAllSelected: (selected: boolean) => void;
  /** Set selectedForPdf for a specific set of region ids (one undo step). */
  setSelectedForIds: (ids: string[], selected: boolean) => void;
  selectAllPending: () => void;
  toggleGroupSelected: (groupId: string) => void;

  groupSelectedRegions: () => boolean;
  renameGroup: (groupId: string, name: string) => void;
  ungroup: (groupId: string) => void;
  addSelectedToGroup: (groupId: string) => void;
  removeRegionFromGroup: (regionId: string) => void;

  startGeocoding: (id: string) => void;
  finishGeocoding: (id: string) => void;

  setMapView: (center: LatLng, zoom: number) => void;
  setSatelliteBasemap: (value: boolean) => void;
  setSearchMarker: (marker: LatLng | null) => void;

  /** Persist the church building pin (with optional address from search or reverse geocode). */
  setChurchPin: (pin: LatLng, address?: string, short?: string) => void;
  clearChurchPin: () => void;
  /** Enter map-click mode to place or move the church pin. */
  beginPlaceChurchPin: () => void;
}

function touch(p: Project): Project {
  return { ...p, updatedAt: Date.now() };
}

export const useRegionStore = create<RegionState>((set, get) => {
  /**
   * Snapshot the current project onto the undo stack before a mutation.
   * Returns the `history`/`future` patch to spread into `set()`. A new edit
   * always clears the redo stack.
   */
  const snapshot = (): Pick<RegionState, 'history' | 'future'> => {
    const next = [...get().history, get().project];
    const history = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    return { history, future: [] };
  };

  return {
  project: emptyProject(),
  filePath: null,
  dirty: false,
  history: [],
  future: [],

  mode: 'idle',
  pendingPinForRegionId: null,
  hoveredRegionId: null,
  hoveredGroupId: null,
  geocodingIds: new Set(),
  heatmapEnabled: false,
  heatmapCap: null,
  searchMarker: null,

  setMode: (mode) => set({ mode }),
  setHoveredRegionId: (hoveredRegionId) => set({ hoveredRegionId }),
  setHoveredGroupId: (hoveredGroupId) => set({ hoveredGroupId }),
  setHeatmapEnabled: (heatmapEnabled) => set({ heatmapEnabled }),
  setHeatmapCap: (heatmapCap) => set({ heatmapCap }),

  loadProject: (project, filePath) => {
    const colored = assignUniqueColors(project.regions);
    const mgr = new MapGroupManager(project.groups ?? [], colored);
    const groupsPruned = mgr.pruneEmpty();
    const { groups, regions } = mgr.snapshot();
    const colorsFixed = colored !== project.regions;
    set({
      project: { ...project, regions, groups },
      filePath,
      // Persist unique-colour / orphan-group cleanup on next save.
      dirty: colorsFixed || groupsPruned,
      mode: 'idle',
      pendingPinForRegionId: null,
      history: [],
      future: [],
    });
  },

  ensureUniqueRegionColors: () => {
    const { project } = get();
    const regions = assignUniqueColors(project.regions);
    if (regions === project.regions) return;
    set({
      ...snapshot(),
      project: touch({ ...project, regions }),
      dirty: true,
    });
  },

  setFilePath: (filePath) => set({ filePath }),
  markClean: () => set({ dirty: false }),

  undo: () => {
    const { history, future, project } = get();
    if (history.length === 0) return;
    set({
      project: history[history.length - 1],
      history: history.slice(0, -1),
      future: [...future, project],
      dirty: true,
      mode: 'idle',
      pendingPinForRegionId: null,
    });
  },

  redo: () => {
    const { history, future, project } = get();
    if (future.length === 0) return;
    set({
      project: future[future.length - 1],
      future: future.slice(0, -1),
      history: [...history, project],
      dirty: true,
      mode: 'idle',
      pendingPinForRegionId: null,
    });
  },

  canUndo: () => get().history.length > 0,
  canRedo: () => get().future.length > 0,

  addRegion: (polygon) => {
    const { project } = get();
    const region: Region = {
      id: uuid(),
      polygon,
      pin: null,
      address: 'Awaiting pin…',
      color: pickColor(project.regions, polygon),
      colorLocked: false,
      status: 'pending',
      selectedForPdf: false,
      soulsSaved: 0,
      groupId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set({
      ...snapshot(),
      project: touch({ ...project, regions: [...project.regions, region] }),
      dirty: true,
      mode: 'pin-drop',
      pendingPinForRegionId: region.id,
    });
    return region;
  },

  updateRegion: (id, patch) => {
    const { project } = get();
    set({
      ...snapshot(),
      project: touch({
        ...project,
        regions: project.regions.map((r) =>
          r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r,
        ),
      }),
      dirty: true,
    });
  },

  removeRegion: (id) => {
    const { project } = get();
    const mgr = new MapGroupManager(project.groups ?? [], project.regions.filter((r) => r.id !== id));
    mgr.pruneEmpty();
    const { groups, regions } = mgr.snapshot();
    set({
      ...snapshot(),
      project: touch({ ...project, regions, groups }),
      dirty: true,
    });
  },

  removeRegions: (ids) => {
    const idSet = new Set(ids);
    const { project } = get();
    const mgr = new MapGroupManager(
      project.groups ?? [],
      project.regions.filter((r) => !idSet.has(r.id)),
    );
    mgr.pruneEmpty();
    const { groups, regions } = mgr.snapshot();
    set({
      ...snapshot(),
      project: touch({ ...project, regions, groups }),
      dirty: true,
    });
  },

  setRegionPin: (id, pin) => {
    get().updateRegion(id, { pin });
    set({ mode: 'idle', pendingPinForRegionId: null });
  },

  beginRepositionPin: (id) => {
    const r = get().project.regions.find((x) => x.id === id);
    if (!r?.pin) return;
    set({ mode: 'pin-drop', pendingPinForRegionId: id });
  },

  setRegionAddress: (id, address, short) =>
    get().updateRegion(id, { address, addressShort: short }),

  setRegionColor: (id, color, locked = true) =>
    get().updateRegion(id, { color, colorLocked: locked }),

  setRegionStatus: (id, status) =>
    get().updateRegion(id, { status, ...(status === 'done' && { selectedForPdf: false }) }),

  toggleSelected: (id) => {
    const r = get().project.regions.find((x) => x.id === id);
    if (!r) return;
    get().updateRegion(id, { selectedForPdf: !r.selectedForPdf });
  },

  setAllSelected: (selected) => {
    const { project } = get();
    set({
      ...snapshot(),
      project: touch({
        ...project,
        regions: project.regions.map((r) => ({ ...r, selectedForPdf: selected })),
      }),
      dirty: true,
    });
  },

  setSelectedForIds: (ids, selected) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const { project } = get();
    set({
      ...snapshot(),
      project: touch({
        ...project,
        regions: project.regions.map((r) =>
          idSet.has(r.id) ? { ...r, selectedForPdf: selected } : r,
        ),
      }),
      dirty: true,
    });
  },

  selectAllPending: () => {
    const { project } = get();
    set({
      ...snapshot(),
      project: touch({
        ...project,
        regions: project.regions.map((r) => ({
          ...r,
          selectedForPdf: r.status === 'pending',
        })),
      }),
      dirty: true,
    });
  },

  toggleGroupSelected: (groupId) => {
    const { project } = get();
    const members = project.regions.filter((r) => r.groupId === groupId);
    if (members.length === 0) return;
    const next = !members.every((r) => r.selectedForPdf);
    set({
      ...snapshot(),
      project: touch({
        ...project,
        regions: project.regions.map((r) =>
          r.groupId === groupId ? { ...r, selectedForPdf: next } : r,
        ),
      }),
      dirty: true,
    });
  },

  groupSelectedRegions: () => {
    const { project } = get();
    const ids = project.regions.filter((r) => r.selectedForPdf).map((r) => r.id);
    const mgr = new MapGroupManager(project.groups ?? [], project.regions);
    if (!mgr.createFromRegionIds(ids)) return false;
    const { groups, regions } = mgr.snapshot();
    set({
      ...snapshot(),
      project: touch({ ...project, groups, regions }),
      dirty: true,
    });
    return true;
  },

  renameGroup: (groupId, name) => {
    const { project } = get();
    const mgr = new MapGroupManager(project.groups ?? [], project.regions);
    if (!mgr.rename(groupId, name)) return;
    const { groups } = mgr.snapshot();
    set({
      ...snapshot(),
      project: touch({ ...project, groups }),
      dirty: true,
    });
  },

  ungroup: (groupId) => {
    const { project } = get();
    const mgr = new MapGroupManager(project.groups ?? [], project.regions);
    mgr.ungroup(groupId);
    const { groups, regions } = mgr.snapshot();
    set({
      ...snapshot(),
      project: touch({ ...project, groups, regions }),
      dirty: true,
    });
  },

  addSelectedToGroup: (groupId) => {
    const { project } = get();
    const ids = project.regions.filter((r) => r.selectedForPdf).map((r) => r.id);
    if (ids.length === 0) return;
    const mgr = new MapGroupManager(project.groups ?? [], project.regions);
    mgr.addRegionsToGroup(groupId, ids);
    const { groups, regions } = mgr.snapshot();
    set({
      ...snapshot(),
      project: touch({ ...project, groups, regions }),
      dirty: true,
    });
  },

  removeRegionFromGroup: (regionId) => {
    const { project } = get();
    const mgr = new MapGroupManager(project.groups ?? [], project.regions);
    mgr.removeRegionFromGroup(regionId);
    const { groups, regions } = mgr.snapshot();
    set({
      ...snapshot(),
      project: touch({ ...project, groups, regions }),
      dirty: true,
    });
  },

  startGeocoding: (id) => {
    const next = new Set(get().geocodingIds);
    next.add(id);
    set({ geocodingIds: next });
  },

  finishGeocoding: (id) => {
    const next = new Set(get().geocodingIds);
    next.delete(id);
    set({ geocodingIds: next });
  },

  setMapView: (mapCenter, mapZoom) => {
    const { project } = get();
    set({ project: touch({ ...project, mapCenter, mapZoom }), dirty: true });
  },

  setSatelliteBasemap: (satelliteBasemap) => {
    const { project } = get();
    set({ project: touch({ ...project, satelliteBasemap }), dirty: true });
  },

  setSearchMarker: (searchMarker) => set({ searchMarker }),

  setChurchPin: (pin, address, short) => {
    const { project } = get();
    set({
      ...snapshot(),
      project: touch({
        ...project,
        churchPin: pin,
        churchAddress: address ?? project.churchAddress,
        churchAddressShort: short ?? project.churchAddressShort,
      }),
      dirty: true,
      mode: 'idle',
      pendingPinForRegionId: null,
      searchMarker: null,
    });
  },

  clearChurchPin: () => {
    const { project } = get();
    if (!project.churchPin && !project.churchAddress) return;
    set({
      ...snapshot(),
      project: touch({
        ...project,
        churchPin: null,
        churchAddress: '',
        churchAddressShort: undefined,
      }),
      dirty: true,
      mode: 'idle',
    });
  },

  beginPlaceChurchPin: () =>
    set({ mode: 'church-pin', pendingPinForRegionId: null }),
  };
});
