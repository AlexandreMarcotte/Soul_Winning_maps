export type LatLng = { lat: number; lng: number };

export type RegionStatus = 'pending' | 'done';

export interface MapGroup {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Region {
  id: string;
  polygon: LatLng[];
  pin: LatLng | null;
  address: string;
  addressShort?: string;
  color: string;
  colorLocked: boolean;
  status: RegionStatus;
  selectedForPdf: boolean;
  /** Non-negative count of souls saved for this region / map capture. */
  soulsSaved: number;
  /** When set, this region belongs to a named group in the sidebar. */
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  schemaVersion: 1;
  name: string;
  createdAt: number;
  updatedAt: number;
  mapCenter: LatLng;
  mapZoom: number;
  /** When true: Esri imagery + street-label overlay; when false: OSM “Street” tiles only. */
  satelliteBasemap: boolean;
  /** Optional landmark pin for the church building (one per project). */
  churchPin: LatLng | null;
  churchAddress: string;
  churchAddressShort?: string;
  regions: Region[];
  groups: MapGroup[];
}

import { DEFAULT_MAP_CITY } from '@/lib/mapCities';

export const WINNIPEG_CENTER: LatLng = DEFAULT_MAP_CITY.center;
export const WINNIPEG_ZOOM = DEFAULT_MAP_CITY.zoom;

export function emptyProject(): Project {
  const now = Date.now();
  return {
    schemaVersion: 1,
    name: 'Soulwinning-26-05-02',
    createdAt: now,
    updatedAt: now,
    mapCenter: DEFAULT_MAP_CITY.center,
    mapZoom: DEFAULT_MAP_CITY.zoom,
    satelliteBasemap: true,
    churchPin: null,
    churchAddress: '',
    regions: [],
    groups: [],
  };
}
