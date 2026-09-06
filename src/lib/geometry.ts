import type { LatLng } from '@/types/region';

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function polygonBounds(points: LatLng[]): Bounds {
  if (points.length === 0) {
    return { south: 0, west: 0, north: 0, east: 0 };
  }
  let south = points[0].lat;
  let north = points[0].lat;
  let west = points[0].lng;
  let east = points[0].lng;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
  }
  return { south, west, north, east };
}

export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

const EARTH_R_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.sqrt(h));
}

export interface Point2D {
  x: number;
  y: number;
}

function ringSignedArea(ring: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    area += ring[i].x * ring[j].y - ring[j].x * ring[i].y;
  }
  return area / 2;
}

function lineIntersection(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): Point2D | null {
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((cx - ax) * sY - (cy - ay) * sX) / denom;
  return { x: ax + t * rX, y: ay + t * rY };
}

/**
 * Offset a simple closed ring toward its interior by `dist`.
 * Used so adjacent region strokes sit side-by-side instead of stacking.
 * Returns the original ring if the inset would collapse the shape.
 */
export function insetRing(ring: Point2D[], dist: number): Point2D[] {
  if (ring.length < 3 || dist === 0) return ring.map((p) => ({ x: p.x, y: p.y }));

  const area = ringSignedArea(ring);
  if (Math.abs(area) < 1e-6) return ring.map((p) => ({ x: p.x, y: p.y }));

  // Positive area = CCW: interior is to the left of each directed edge.
  // Negative area = CW: interior is to the right (flip normals).
  const sign = area >= 0 ? 1 : -1;
  const n = ring.length;
  const out: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const curr = ring[i];
    const next = ring[(i + 1) % n];

    let e1x = curr.x - prev.x;
    let e1y = curr.y - prev.y;
    const len1 = Math.hypot(e1x, e1y) || 1;
    e1x /= len1;
    e1y /= len1;

    let e2x = next.x - curr.x;
    let e2y = next.y - curr.y;
    const len2 = Math.hypot(e2x, e2y) || 1;
    e2x /= len2;
    e2y /= len2;

    // Inward unit normals
    const n1x = -e1y * sign;
    const n1y = e1x * sign;
    const n2x = -e2y * sign;
    const n2y = e2x * sign;

    // Offset copies of the two edges meeting at curr
    const a1x = prev.x + n1x * dist;
    const a1y = prev.y + n1y * dist;
    const b1x = curr.x + n1x * dist;
    const b1y = curr.y + n1y * dist;
    const a2x = curr.x + n2x * dist;
    const a2y = curr.y + n2y * dist;
    const b2x = next.x + n2x * dist;
    const b2y = next.y + n2y * dist;

    const hit = lineIntersection(a1x, a1y, b1x, b1y, a2x, a2y, b2x, b2y);
    if (hit) {
      out.push(hit);
    } else {
      out.push({ x: (b1x + a2x) / 2, y: (b1y + a2y) / 2 });
    }
  }

  // Reject collapsed / inverted insets (area dropped too far or flipped).
  const insetArea = ringSignedArea(out);
  if (insetArea * area <= 0 || Math.abs(insetArea) < Math.abs(area) * 0.05) {
    return ring.map((p) => ({ x: p.x, y: p.y }));
  }
  return out;
}

/**
 * Geographic inward offset in meters (local equirectangular around the ring).
 * Useful for map strokes so shared parcel edges read as parallel colors.
 */
export function insetLatLngRing(ring: LatLng[], meters: number): LatLng[] {
  if (ring.length < 3 || meters === 0) return ring.map((p) => ({ lat: p.lat, lng: p.lng }));
  const c = centroid(ring);
  const cosLat = Math.cos((c.lat * Math.PI) / 180);
  const mPerDegLat = 110_540;
  const mPerDegLng = Math.max(1e-6, 111_320 * cosLat);

  const xy = ring.map((p) => ({
    x: (p.lng - c.lng) * mPerDegLng,
    y: (p.lat - c.lat) * mPerDegLat,
  }));
  const inset = insetRing(xy, meters);
  return inset.map((p) => ({
    lat: c.lat + p.y / mPerDegLat,
    lng: c.lng + p.x / mPerDegLng,
  }));
}
