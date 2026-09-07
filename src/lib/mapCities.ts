import type { LatLng } from '@/types/region';

export type MapCityId = 'winnipeg' | 'calgary' | 'vancouver';

export interface MapCity {
  id: MapCityId;
  label: string;
  center: LatLng;
  zoom: number;
  /** Nominatim viewbox: west,north,east,south */
  viewbox: string;
  /** Appended when a plain query returns nothing near the city. */
  searchSuffix: string;
  /** Used to detect city name already present in a query. */
  namePattern: RegExp;
}

export const MAP_CITIES: readonly MapCity[] = [
  {
    id: 'winnipeg',
    label: 'Winnipeg',
    center: { lat: 49.8951, lng: -97.1384 },
    zoom: 12,
    viewbox: '-97.35,50.05,-96.90,49.70',
    searchSuffix: 'Winnipeg, MB',
    namePattern: /winnipeg/i,
  },
  {
    id: 'calgary',
    label: 'Calgary',
    center: { lat: 51.0447, lng: -114.0719 },
    zoom: 12,
    viewbox: '-114.35,51.20,-113.85,50.85',
    searchSuffix: 'Calgary, AB',
    namePattern: /calgary/i,
  },
  {
    id: 'vancouver',
    label: 'Vancouver BC',
    center: { lat: 49.2827, lng: -123.1207 },
    zoom: 12,
    viewbox: '-123.35,49.40,-122.95,49.15',
    searchSuffix: 'Vancouver, BC',
    namePattern: /vancouver/i,
  },
] as const;

export const DEFAULT_MAP_CITY = MAP_CITIES[0];

function distanceSq(a: LatLng, b: LatLng): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
}

export function getMapCity(id: MapCityId): MapCity {
  return MAP_CITIES.find((c) => c.id === id) ?? DEFAULT_MAP_CITY;
}

/** Nearest city preset to a map center (for UI + geocode bias). */
export function nearestMapCity(center: LatLng): MapCity {
  let best = DEFAULT_MAP_CITY;
  let bestDist = Infinity;
  for (const city of MAP_CITIES) {
    const d = distanceSq(center, city.center);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  }
  return best;
}
