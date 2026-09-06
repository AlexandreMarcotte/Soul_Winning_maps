import type { Region } from '@/types/region';
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

export function pickColor(existing: Region[], newPolygon: { lat: number; lng: number }[]): string {
  if (existing.length === 0) return PALETTE[0];
  const newCentroid = centroid(newPolygon);

  const nearbyColors = existing
    .filter(r => r.polygon.length > 0 && haversineMeters(centroid(r.polygon), newCentroid) <= NEAR_RADIUS_M)
    .map(r => r.color);

  if (nearbyColors.length === 0) return PALETTE[0];

  // Prefer a palette color that no nearby region uses. Among unused candidates,
  // pick the one whose minimum distance to any nearby color is largest (maximin)
  // so visually-similar colors don't cluster.
  const nearbySet = new Set(nearbyColors);
  const unusedCandidates = PALETTE.filter(c => !nearbySet.has(c));

  // Fall back to the full palette only if every color is already taken nearby —
  // at that point a repeat is unavoidable, so pick the most-distinct repeat.
  const candidates = unusedCandidates.length > 0 ? unusedCandidates : PALETTE;

  let bestColor = candidates[0];
  let bestMinDist = -1;
  for (const candidate of candidates) {
    const minDist = Math.min(...nearbyColors.map(c => colorDistance(candidate, c)));
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestColor = candidate;
    }
  }
  return bestColor;
}
