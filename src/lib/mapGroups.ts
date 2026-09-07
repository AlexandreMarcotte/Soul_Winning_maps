import { v4 as uuid } from 'uuid';
import type { MapGroup, Region } from '@/types/region';

export interface GroupedRegions {
  grouped: { group: MapGroup; members: Region[] }[];
  ungrouped: Region[];
}

/**
 * Mutating helper for named map groups. Callers snapshot undo state, then write
 * `snapshot()` back onto the project.
 */
export class MapGroupManager {
  private groups: MapGroup[];
  private regions: Region[];

  constructor(groups: MapGroup[], regions: Region[]) {
    this.groups = groups;
    this.regions = regions;
  }

  snapshot(): { groups: MapGroup[]; regions: Region[] } {
    return { groups: this.groups, regions: this.regions };
  }

  static nextName(groups: MapGroup[]): string {
    const used = new Set(groups.map((g) => g.name));
    let n = groups.length + 1;
    let name = `Group ${n}`;
    while (used.has(name)) {
      n += 1;
      name = `Group ${n}`;
    }
    return name;
  }

  /** True when the ids can form a new group (2+ maps, not already exactly one group). */
  static canCreateGroup(regions: Region[], ids: string[]): boolean {
    if (ids.length < 2) return false;
    const idSet = new Set(ids);
    const selected = regions.filter((r) => idSet.has(r.id));
    if (selected.length < 2) return false;
    const firstGroup = selected[0].groupId;
    if (!firstGroup) return true;
    const allSameGroup = selected.every((r) => r.groupId === firstGroup);
    if (!allSameGroup) return true;
    const memberCount = regions.filter((r) => r.groupId === firstGroup).length;
    return memberCount !== selected.length;
  }

  createFromRegionIds(ids: string[], name?: string): boolean {
    if (!MapGroupManager.canCreateGroup(this.regions, ids)) return false;
    const idSet = new Set(ids);
    const now = Date.now();
    const group: MapGroup = {
      id: uuid(),
      name: name?.trim() || MapGroupManager.nextName(this.groups),
      createdAt: now,
      updatedAt: now,
    };
    this.groups = [...this.groups, group];
    this.regions = this.regions.map((r) =>
      idSet.has(r.id) ? { ...r, groupId: group.id, updatedAt: now } : r,
    );
    this.pruneEmpty();
    return true;
  }

  rename(groupId: string, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const current = this.groups.find((g) => g.id === groupId);
    if (!current || current.name === trimmed) return false;
    this.groups = this.groups.map((g) =>
      g.id === groupId ? { ...g, name: trimmed, updatedAt: Date.now() } : g,
    );
    return true;
  }

  ungroup(groupId: string): void {
    const now = Date.now();
    this.groups = this.groups.filter((g) => g.id !== groupId);
    this.regions = this.regions.map((r) =>
      r.groupId === groupId ? { ...r, groupId: null, updatedAt: now } : r,
    );
  }

  removeRegionFromGroup(regionId: string): void {
    const now = Date.now();
    this.regions = this.regions.map((r) =>
      r.id === regionId && r.groupId ? { ...r, groupId: null, updatedAt: now } : r,
    );
    this.pruneEmpty();
  }

  addRegionsToGroup(groupId: string, ids: string[]): void {
    if (!this.groups.some((g) => g.id === groupId) || ids.length === 0) return;
    const idSet = new Set(ids);
    const now = Date.now();
    this.regions = this.regions.map((r) =>
      idSet.has(r.id) ? { ...r, groupId, updatedAt: now } : r,
    );
    this.groups = this.groups.map((g) =>
      g.id === groupId ? { ...g, updatedAt: now } : g,
    );
    this.pruneEmpty();
  }

  pruneEmpty(): boolean {
    const used = new Set(
      this.regions.map((r) => r.groupId).filter((id): id is string => Boolean(id)),
    );
    const nextGroups = this.groups.filter((g) => used.has(g.id));
    const valid = new Set(nextGroups.map((g) => g.id));
    let regionsChanged = false;
    const nextRegions = this.regions.map((r) => {
      if (r.groupId && !valid.has(r.groupId)) {
        regionsChanged = true;
        return { ...r, groupId: null };
      }
      return r;
    });
    const groupsChanged = nextGroups.length !== this.groups.length;
    if (groupsChanged) this.groups = nextGroups;
    if (regionsChanged) this.regions = nextRegions;
    return groupsChanged || regionsChanged;
  }
}

/** Split a (usually already-filtered) region list into named groups and leftovers. */
export function organizeRegionsByGroup(regions: Region[], groups: MapGroup[]): GroupedRegions {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const membersByGroup = new Map<string, Region[]>();
  const ungrouped: Region[] = [];

  for (const r of regions) {
    if (r.groupId && groupById.has(r.groupId)) {
      const list = membersByGroup.get(r.groupId) ?? [];
      list.push(r);
      membersByGroup.set(r.groupId, list);
    } else {
      ungrouped.push(r);
    }
  }

  const grouped = [...groups]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((group) => ({ group, members: membersByGroup.get(group.id) ?? [] }))
    .filter((entry) => entry.members.length > 0);

  return { grouped, ungrouped };
}
