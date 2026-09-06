import type { LatLng } from '@/types/region';

export interface GeocodeResult {
  display: string;
  short: string;
}

export interface AddressSearchResult {
  display: string;
  short: string;
  lat: number;
  lng: number;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'WinnipegCanvass/0.1 (alexandre.marcotte.1094@gmail.com)';
const MIN_GAP_MS = 1100;

/** Approximate Winnipeg bounding box: west,north,east,south (Nominatim viewbox). */
const WINNIPEG_VIEWBOX = '-97.35,50.05,-96.90,49.70';

const reverseCache = new Map<string, GeocodeResult>();
const searchCache = new Map<string, AddressSearchResult[]>();
let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();

function reverseKey(p: LatLng): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

function shortenAddress(json: any): string {
  const a = json?.address ?? {};
  const number = a.house_number;
  const street = a.road ?? a.pedestrian ?? a.cycleway ?? a.footway;
  if (number && street) return `${number} ${street}`;
  if (street) return street;
  if (a.suburb) return a.suburb;
  if (a.neighbourhood) return a.neighbourhood;
  return (json?.display_name ?? '').split(',').slice(0, 2).join(',').trim();
}

async function throttledFetch(url: string): Promise<Response> {
  const wait = MIN_GAP_MS - (Date.now() - lastRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn);
  queue = next.catch(() => undefined);
  return next;
}

async function rawReverse(p: LatLng): Promise<GeocodeResult> {
  const url =
    `${NOMINATIM_BASE}/reverse?format=jsonv2` +
    `&lat=${p.lat}&lon=${p.lng}&zoom=18&addressdetails=1`;
  const res = await throttledFetch(url);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const json = await res.json();
  const display: string = json?.display_name ?? `Pin at ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const short = shortenAddress(json) || display.split(',')[0]?.trim() || display;
  return { display, short };
}

async function rawSearch(query: string): Promise<AddressSearchResult[]> {
  const q = encodeURIComponent(query.trim());
  const url =
    `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=1&limit=5` +
    `&countrycodes=ca&viewbox=${WINNIPEG_VIEWBOX}&bounded=0` +
    `&q=${q}`;
  const res = await throttledFetch(url);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const json = (await res.json()) as any[];
  if (!Array.isArray(json)) return [];

  return json
    .map((item) => {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const display: string = item.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const short = shortenAddress(item) || display.split(',')[0]?.trim() || display;
      return { display, short, lat, lng } satisfies AddressSearchResult;
    })
    .filter((r): r is AddressSearchResult => r !== null);
}

export async function reverseGeocode(p: LatLng): Promise<GeocodeResult> {
  const k = reverseKey(p);
  const cached = reverseCache.get(k);
  if (cached) return cached;

  return enqueue(async () => {
    const r = await rawReverse(p);
    reverseCache.set(k, r);
    return r;
  });
}

/** Forward-geocode an address; results prefer Winnipeg but can fall outside the city. */
export async function searchAddress(query: string): Promise<AddressSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = trimmed.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  return enqueue(async () => {
    let results = await rawSearch(trimmed);
    // If nothing near Winnipeg, retry without the local bias so the query still works.
    if (results.length === 0 && !/winnipeg/i.test(trimmed)) {
      const fallbackQ = encodeURIComponent(`${trimmed}, Winnipeg, MB`);
      const url =
        `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=1&limit=5` +
        `&countrycodes=ca&q=${fallbackQ}`;
      const res = await throttledFetch(url);
      if (res.ok) {
        const json = (await res.json()) as any[];
        if (Array.isArray(json)) {
          results = json
            .map((item) => {
              const lat = Number(item.lat);
              const lng = Number(item.lon);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              const display: string = item.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
              const short = shortenAddress(item) || display.split(',')[0]?.trim() || display;
              return { display, short, lat, lng } satisfies AddressSearchResult;
            })
            .filter((r): r is AddressSearchResult => r !== null);
        }
      }
    }
    searchCache.set(cacheKey, results);
    return results;
  });
}

export function fallbackAddress(p: LatLng): GeocodeResult {
  const s = `Pin at ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  return { display: s, short: s };
}

/** Sensible zoom when flying to a searched address. */
export const ADDRESS_SEARCH_ZOOM = 17;
