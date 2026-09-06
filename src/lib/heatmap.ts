/**
 * Heatmap color ramp for soulsSaved counts.
 *
 * 0 souls → red, mid → yellow, max → green.
 * (Low counts read as "needs attention", high counts as "good".)
 */

type RGB = { r: number; g: number; b: number };

const RED: RGB = { r: 239, g: 68, b: 68 };       // #ef4444
const YELLOW: RGB = { r: 234, g: 179, b: 8 };    // #eab308
const GREEN: RGB = { r: 34, g: 197, b: 94 };     // #22c55e

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

function toHex(c: RGB): string {
  const h = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * Map a soulsSaved value to a hex color.
 * @param value Current region's soulsSaved (clamped to [0, max]).
 * @param max   Highest soulsSaved among visible regions. When max ≤ 0, every region is at 0 → red.
 */
export function heatmapColor(value: number, max: number): string {
  if (!Number.isFinite(value) || value <= 0) return toHex(RED);
  if (max <= 0) return toHex(RED);
  const t = Math.min(1, value / max);
  // 0 → RED, 0.5 → YELLOW, 1 → GREEN
  const rgb = t < 0.5
    ? lerpRgb(RED, YELLOW, t / 0.5)
    : lerpRgb(YELLOW, GREEN, (t - 0.5) / 0.5);
  return toHex(rgb);
}
