import type { Project } from '@/types/region';
import { emptyProject } from '@/types/region';

function nonNegativeInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(json: string): Project {
  const raw = JSON.parse(json);
  if (raw?.schemaVersion !== 1 || !Array.isArray(raw.regions)) {
    throw new Error('Invalid or unsupported project file');
  }
  const base = emptyProject();
  const churchPin =
    raw.churchPin &&
    typeof raw.churchPin.lat === 'number' &&
    typeof raw.churchPin.lng === 'number'
      ? { lat: raw.churchPin.lat, lng: raw.churchPin.lng }
      : null;
  return {
    ...base,
    ...raw,
    satelliteBasemap:
      typeof raw.satelliteBasemap === 'boolean' ? raw.satelliteBasemap : base.satelliteBasemap,
    churchPin,
    churchAddress: String(raw.churchAddress ?? ''),
    churchAddressShort:
      raw.churchAddressShort !== undefined ? String(raw.churchAddressShort) : undefined,
    regions: raw.regions.map((r: any) => ({
      id: String(r.id),
      polygon: Array.isArray(r.polygon) ? r.polygon : [],
      pin: r.pin ?? null,
      address: String(r.address ?? ''),
      addressShort: r.addressShort,
      color: String(r.color ?? '#4E79A7'),
      colorLocked: Boolean(r.colorLocked),
      status: r.status === 'done' ? 'done' : 'pending',
      selectedForPdf: Boolean(r.selectedForPdf),
      soulsSaved: nonNegativeInt(r.soulsSaved, 0),
      createdAt: Number(r.createdAt ?? Date.now()),
      updatedAt: Number(r.updatedAt ?? Date.now()),
    })),
  };
}
