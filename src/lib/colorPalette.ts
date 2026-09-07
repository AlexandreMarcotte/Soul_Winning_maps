import type { LatLng, Region } from '@/types/region';
import { centroid, haversineMeters } from './geometry';

// Ordered so that consecutive colors are as visually distinct as possible
export const PALETTE = [
  '#E63946', // Red
  '#1565C0', // Blue
  '#2E7D32', // Green
  '#FF6D00', // Orange
  '#7B1FA2', // Purple
  '#00838F', // Teal
  '#F9A825', // Yellow
  '#AD1457', // Magenta
  '#4E342E', // Brown
  '#546E7A', // Blue-gray
  '#D62728', // Red 2
  '#4E79A7', // Steel blue
  '#59A14F', // Light green
  '#F28E2B', // Amber
  '#B07AA1', // Lavender
  '#76B7B2', // Light teal
  '#EDC948', // Light yellow
  '#E15759', // Salmon
  '#9C755F', // Tan
  '#37474F', // Dark slate
  '#C62828', // Dark red
  '#6BAED6', // Light blue
  '#8D6E63', // Warm brown
  '#78909C', // Gray-blue
];

const NEAR_RADIUS_M = 500;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function normalizeColor(hex: string): string {
  return hex.trim().toUpperCase();
}

/**
 * Pick a color for a new region. Prefers a palette colour unused by any existing
 * region so every map stays unique until the palette is exhausted. Among unused
 * candidates, maximises distance from nearby colours for local contrast.
 */
export function pickColor(existing: Region[], newPolygon: LatLng[]): string {
  if (existing.length === 0) return PALETTE[0];

  const usedGlobal = new Set(existing.map((r) => normalizeColor(r.color)));
  const unusedGlobal = PALETTE.filter((c) => !usedGlobal.has(normalizeColor(c)));

  const newCentroid = centroid(newPolygon);
  const nearbyColors = existing
    .filter(
      (r) =>
        r.polygon.length > 0 &&
        haversineMeters(centroid(r.polygon), newCentroid) <= NEAR_RADIUS_M,
    )
    .map((r) => r.color);

  // Prefer globally unused colours; only repeat after the palette is fully used.
  const candidates = unusedGlobal.length > 0 ? unusedGlobal : PALETTE;

  if (nearbyColors.length === 0) return candidates[0];

  let bestColor = candidates[0];
  let bestMinDist = -1;
  for (const candidate of candidates) {
    const minDist = Math.min(...nearbyColors.map((c) => colorDistance(candidate, c)));
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestColor = candidate;
    }
  }
  return bestColor;
}

/**
 * Reassign colours so unlocked regions are unique across the project (until the
 * palette runs out). Locked colours are kept; later unlocked regions avoid them.
 * Returns a new array; regions whose colour did not change keep the same object.
 */
export function assignUniqueColors(regions: Region[]): Region[] {
  if (regions.length === 0) return regions;

  // Preserve creation order so older regions keep their colour when possible.
  const ordered = [...regions].sort((a, b) => a.createdAt - b.createdAt);
  const used = new Set<string>();
  const colorById = new Map<string, string>();

  // Pass 1: honour locked colours (and first-claim unlocked colours that don't clash).
  for (const r of ordered) {
    const color = normalizeColor(r.color);
    if (r.colorLocked) {
      used.add(color);
      colorById.set(r.id, r.color);
    }
  }

  // Pass 2: keep existing unlocked colours when still unique, else pick a new one.
  for (const r of ordered) {
    if (colorById.has(r.id)) continue;
    const color = normalizeColor(r.color);
    if (!used.has(color)) {
      used.add(color);
      colorById.set(r.id, r.color);
      continue;
    }
    const next = pickColor(
      ordered
        .filter((o) => colorById.has(o.id))
        .map((o) => ({ ...o, color: colorById.get(o.id)! })),
      r.polygon.length >= 1 ? r.polygon : [{ lat: 0, lng: 0 }],
    );
    used.add(normalizeColor(next));
    colorById.set(r.id, next);
  }

  let changed = false;
  const result = regions.map((r) => {
    const next = colorById.get(r.id) ?? r.color;
    if (normalizeColor(next) === normalizeColor(r.color)) return r;
    changed = true;
    return { ...r, color: next, updatedAt: Date.now() };
  });
  return changed ? result : regions;
}
