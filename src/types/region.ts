export type LatLng = { lat: number; lng: number };

export type RegionStatus = 'pending' | 'done';

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
}

export const WINNIPEG_CENTER: LatLng = { lat: 49.8951, lng: -97.1384 };
export const WINNIPEG_ZOOM = 12;

export function emptyProject(): Project {
  const now = Date.now();
  return {
    schemaVersion: 1,
    name: 'Soulwinning-26-05-02',
    createdAt: now,
    updatedAt: now,
    mapCenter: WINNIPEG_CENTER,
    mapZoom: WINNIPEG_ZOOM,
    satelliteBasemap: true,
    churchPin: null,
    churchAddress: '',
    regions: [],
  };
}
