import L from 'leaflet';
import type { LatLng, Region } from '@/types/region';
import {
  CARTO_VOYAGER_LABELS_URL,
  ESRI_WORLD_IMAGERY_URL,
  OSM_STANDARD_TILE_URL,
} from '@/lib/mapTiles';
import { CHURCH_PIN_COLOR } from '@/lib/churchPin';
import { haversineMeters, insetRing, polygonBounds } from './geometry';

export interface CaptureRegionOptions {
  /** Match main map: Esri + label overlay vs OSM street tiles only. Default true. */
  satelliteBasemap?: boolean;
  /** Extra padding (px) kept above and below the polygon when auto-cropping. Default 60. */
  cropPaddingPx?: number;
  /**
   * Shared tile cache keyed by tile URL. Reusing this across multiple captureRegion calls
   * avoids re-fetching the same tiles for nearby/overlapping regions.
   */
  tileCache?: Map<string, Promise<HTMLImageElement | null>>;
}

// Output canvas size (pixels in the final JPEG).
// ~2000 px across a ~7.5" PDF map box ≈ 270 DPI — crisp on screen and in print.
const CAPTURE_W = 2000;
const CAPTURE_H = 2333;

// The offscreen Leaflet container is rendered at a smaller logical size, then every tile
// and polygon coordinate is multiplied by RENDER_SCALE when drawn onto the canvas.
// This makes all map text (street names, door numbers) appear larger in the exported PDF
// while keeping every layer perfectly aligned — they all use the same scale factor.
//
// Keep CONTAINER near the original ~750×875: street-name size is fixed in the tiles, so a
// larger container makes labels look smaller relative to the neighborhood. CAPTURE stayed
// at 2000 for print sharpness; RENDER_SCALE rises to match.
const CONTAINER_W = 750;
const CONTAINER_H = 875;
const RENDER_SCALE = CAPTURE_W / CONTAINER_W; // ≈ 2.667

/** Scale overlay strokes/pins/badges so they stay the same physical size as the old 1200-wide exports. */
const UI_SCALE = CAPTURE_W / 1200;

/** JPEG quality for embedded map images (0–1). */
const CAPTURE_JPEG_QUALITY = 0.98;

const DONE_COLOR = '#6B7280';

/**
 * Light color grade for Esri imagery in PDF captures.
 * Avoid hue-rotate / heavy saturate — those caused the green-yellow cast in exports.
 * Mild contrast keeps rooftops and parcel edges looking defined when printed.
 */
const SATELLITE_PDF_FILTER = 'contrast(1.12) brightness(1.02) saturate(1.1)';

/**
 * Leaflet “retina” tile sizing: request zoom+1 tiles but display them at half size.
 * Native 256px imagery is then downscaled into the canvas (sharp) instead of upscaled (soft).
 */
function hiResBaseTileOptions(extra: L.TileLayerOptions = {}): L.TileLayerOptions {
  return {
    maxZoom: 18,
    maxNativeZoom: 19,
    tileSize: 128,
    zoomOffset: 1,
    ...extra,
  };
}

function addPdfBasemapLayers(
  map: L.Map,
  satelliteBasemap: boolean,
): { baseLayer: L.TileLayer; labelsLayer: L.TileLayer | null } {
  if (satelliteBasemap) {
    const baseLayer = L.tileLayer(ESRI_WORLD_IMAGERY_URL, hiResBaseTileOptions()).addTo(map);
    // CARTO @2x already supplies 512px label art for the 256 grid — do not also apply hiRes.
    const labelsLayer = L.tileLayer(CARTO_VOYAGER_LABELS_URL, {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);
    return { baseLayer, labelsLayer };
  }
  const baseLayer = L.tileLayer(
    OSM_STANDARD_TILE_URL,
    hiResBaseTileOptions({ subdomains: 'abc' }),
  ).addTo(map);
  return { baseLayer, labelsLayer: null };
}

function makeOffscreenContainer(): HTMLDivElement {
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.left = '-100000px';
  div.style.top = '0';
  div.style.width = `${CONTAINER_W}px`;
  div.style.height = `${CONTAINER_H}px`;
  div.style.pointerEvents = 'none';
  div.style.background = '#e8e8e8';
  document.body.appendChild(div);
  return div;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

async function waitForTiles(layer: L.TileLayer): Promise<void> {
  const internal = layer as unknown as { _loading?: boolean };
  // Short settle delay — tiles are marked loaded but the browser may still be painting them.
  const SETTLE_MS = 150;
  if (!internal._loading) {
    await new Promise<void>((r) => setTimeout(r, SETTLE_MS));
    return;
  }
  await new Promise<void>((resolve) => {
    const done = (): void => {
      layer.off('load', done);
      setTimeout(resolve, SETTLE_MS);
    };
    layer.on('load', done);
    setTimeout(done, 10_000);
  });
}

/**
 * Fetch a tile URL as a blob and return a ready HTMLImageElement.
 * Using a blob: URL means drawing it on canvas does NOT taint the canvas,
 * bypassing the cross-origin restriction entirely.
 *
 * An optional cache (keyed by URL) can be passed so that adjacent regions
 * sharing the same tiles avoid duplicate network requests.
 */
function fetchTileImage(
  src: string,
  cache?: Map<string, Promise<HTMLImageElement | null>>,
): Promise<HTMLImageElement | null> {
  if (cache?.has(src)) return cache.get(src)!;

  const promise = (async (): Promise<HTMLImageElement | null> => {
    try {
      const resp = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      return await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    } catch {
      return null;
    }
  })();

  cache?.set(src, promise);
  return promise;
}

/** Diagonal dashed hatch clipped to the polygon interior (done regions only). */
function strokeDoneInteriorHatch(
  ctx: CanvasRenderingContext2D,
  ring: { x: number; y: number }[],
  color: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ring[0].x, ring[0].y);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
  ctx.closePath();
  ctx.clip();

  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const h = maxY - minY;
  const pad = 24 * UI_SCALE;
  const step = 11 * UI_SCALE;

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1.8 * UI_SCALE;
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  const wSpan = maxX - minX + 2 * pad;
  for (let t = -h - pad; t < wSpan + pad; t += step) {
    ctx.beginPath();
    ctx.moveTo(minX + t, minY - pad);
    ctx.lineTo(minX + t + h + 2 * pad, maxY + pad);
    ctx.stroke();
  }

  ctx.restore();
}

// scale: multiply all latLngToContainerPoint coords by this before drawing on canvas.
function drawPolygonAndPin(
  ctx: CanvasRenderingContext2D,
  map: L.Map,
  region: Region,
  color: string,
  fillOpacity: number,
  scale: number,
): void {
  const ring = region.polygon.map((p) => {
    const pt = map.latLngToContainerPoint(L.latLng(p.lat, p.lng));
    return { x: pt.x * scale, y: pt.y * scale };
  });
  const isDone = region.status === 'done';
  if (ring.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
    ctx.closePath();
    if (fillOpacity > 0) {
      ctx.fillStyle = hexToRgba(color, fillOpacity);
      ctx.fill();
      if (isDone) {
        strokeDoneInteriorHatch(ctx, ring, color);
      }
    }
    // Inset the stroke so shared edges between adjacent regions sit side-by-side
    // (each colour on its own parcel) instead of painting over one another.
    const strokeWidth = 4 * UI_SCALE;
    const strokeRing = insetRing(ring, strokeWidth / 2);
    ctx.beginPath();
    ctx.moveTo(strokeRing[0].x, strokeRing[0].y);
    for (let i = 1; i < strokeRing.length; i++) ctx.lineTo(strokeRing[i].x, strokeRing[i].y);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    if (isDone) ctx.setLineDash([8 * UI_SCALE, 6 * UI_SCALE]);
    ctx.stroke();
    if (isDone) ctx.setLineDash([]);
  }

  if (region.pin) {
    drawPin(ctx, map, region, color, scale);
  }
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  map: L.Map,
  region: Region,
  color: string,
  scale: number,
): void {
  if (!region.pin) return;
  drawPinAt(ctx, map, region.pin, color, scale);
}

function drawPinAt(
  ctx: CanvasRenderingContext2D,
  map: L.Map,
  pin: LatLng,
  color: string,
  scale: number,
  options?: { cross?: boolean },
): void {
  const raw = map.latLngToContainerPoint(L.latLng(pin.lat, pin.lng));
  const p = { x: raw.x * scale, y: raw.y * scale };
  // Teardrop pin — same SVG path as the on-screen Leaflet marker (24×36 viewBox, tip at bottom).
  const PIN_SCALE = 1.4 * UI_SCALE;
  const pinPath = new Path2D(
    'M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.373 18.627 0 12 0z',
  );
  ctx.save();
  ctx.translate(p.x - 12 * PIN_SCALE, p.y - 36 * PIN_SCALE);
  ctx.scale(PIN_SCALE, PIN_SCALE);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6 / PIN_SCALE;
  ctx.shadowOffsetY = 3 / PIN_SCALE;
  ctx.fillStyle = color;
  ctx.fill(pinPath);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.stroke(pinPath);
  if (options?.cross) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(11, 5.5, 2, 11);
    ctx.fillRect(8, 8, 8, 2);
  } else {
    ctx.beginPath();
    ctx.arc(12, 12, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
  }
  ctx.restore();
}

export interface CaptureOverviewOptions {
  /** Match main map: Esri + label overlay vs OSM street tiles only. Default true. */
  satelliteBasemap?: boolean;
  /** Shared tile cache (see CaptureRegionOptions). */
  tileCache?: Map<string, Promise<HTMLImageElement | null>>;
  /** Optional church landmark included in bounds and drawn on the overview. */
  churchPin?: LatLng | null;
}

/**
 * Render a single image showing every region polygon together, fit to their combined
 * bounds. Each polygon is filled with its own color and numbered (1..N) matching the
 * order regions appear on subsequent PDF pages.
 */
export async function captureOverview(
  regions: Region[],
  options?: CaptureOverviewOptions,
): Promise<string> {
  const drawable = regions.filter((r) => r.polygon.length >= 3);
  if (drawable.length === 0) {
    throw new Error('No regions with polygons to render in overview');
  }

  const satelliteBasemap = options?.satelliteBasemap ?? true;
  const tileCache = options?.tileCache;
  const churchPin = options?.churchPin ?? null;

  const container = makeOffscreenContainer();
  let map: L.Map | null = null;
  try {
    map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: false,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
    });

    let baseLayer: L.TileLayer;
    let labelsLayer: L.TileLayer | null = null;

    ({ baseLayer, labelsLayer } = addPdfBasemapLayers(map, satelliteBasemap));

    // Frame the selected regions. Only expand for the church pin when it sits near
    // that cluster — a distant landmark used to yank the overview off-center.
    let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
    for (const r of drawable) {
      const b = polygonBounds(r.polygon);
      if (b.south < south) south = b.south;
      if (b.west < west) west = b.west;
      if (b.north > north) north = b.north;
      if (b.east > east) east = b.east;
    }
    const regionCenter = { lat: (south + north) / 2, lng: (west + east) / 2 };
    const regionDiagonalM = Math.max(
      1,
      haversineMeters({ lat: south, lng: west }, { lat: north, lng: east }),
    );
    // Allow church within ~1.5× the region span (min 400 m) so nearby landmarks
    // still appear without pulling framing toward a far-away pin.
    const churchNearRegions =
      churchPin != null &&
      haversineMeters(regionCenter, churchPin) <= Math.max(400, regionDiagonalM * 1.5);
    if (churchNearRegions && churchPin) {
      if (churchPin.lat < south) south = churchPin.lat;
      if (churchPin.lng < west) west = churchPin.lng;
      if (churchPin.lat > north) north = churchPin.lat;
      if (churchPin.lng > east) east = churchPin.lng;
    }
    const bounds = L.latLngBounds([south, west], [north, east]);
    // Offscreen maps need an explicit size pass before fitBounds or Leaflet can
    // use a stale viewport and leave content off-center.
    map.invalidateSize({ pan: false });
    (map.options as { zoomSnap?: number }).zoomSnap = 0;
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 });

    const layersToWait = labelsLayer ? [baseLayer, labelsLayer] : [baseLayer];
    await Promise.all(layersToWait.map((layer) => waitForTiles(layer)));

    const canvas = document.createElement('canvas');
    canvas.width = CAPTURE_W;
    canvas.height = CAPTURE_H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, CAPTURE_W, CAPTURE_H);

    const rootRect = map.getContainer().getBoundingClientRect();

    const drawLayerTiles = async (layer: L.TileLayer): Promise<void> => {
      const layerContainer = layer.getContainer();
      if (!layerContainer) return;
      const tileImgs = Array.from(layerContainer.querySelectorAll<HTMLImageElement>('img.leaflet-tile'));
      await Promise.all(
        tileImgs.map(async (imgEl) => {
          if (!imgEl.src) return;
          const blobImg = await fetchTileImage(imgEl.src, tileCache);
          if (!blobImg) return;
          const ir = imgEl.getBoundingClientRect();
          const dx = Math.floor((ir.left - rootRect.left) * RENDER_SCALE);
          const dy = Math.floor((ir.top - rootRect.top) * RENDER_SCALE);
          const dw = Math.ceil(ir.width * RENDER_SCALE);
          const dh = Math.ceil(ir.height * RENDER_SCALE);
          ctx.drawImage(blobImg, dx, dy, dw, dh);
        }),
      );
    };

    // Downscale hi-res tiles with high-quality smoothing (avoids soft bilinear defaults).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (satelliteBasemap) {
      ctx.filter = SATELLITE_PDF_FILTER;
    }
    await drawLayerTiles(baseLayer);
    ctx.filter = 'none';

    // Draw every polygon with a translucent fill so overlapping context is visible.
    // Pins are deferred until after the labels and number badges so they sit on top.
    for (const r of drawable) {
      const color = r.status === 'done' ? DONE_COLOR : r.color;
      drawPolygonAndPin(ctx, map, { ...r, pin: null }, color, 0, RENDER_SCALE);
    }

    if (labelsLayer) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      await drawLayerTiles(labelsLayer);
    }

    // Pin head positions in canvas coords — used to push number badges away when
    // they would otherwise sit directly over a pin.
    const PIN_HEAD_SCALE = 1.4 * UI_SCALE; // must match drawPin's PIN_SCALE
    const PIN_HEAD_RADIUS = 12 * PIN_HEAD_SCALE; // SVG head radius scaled
    const pinHeads: { x: number; y: number }[] = [];
    for (const r of drawable) {
      if (!r.pin) continue;
      const raw = map.latLngToContainerPoint(L.latLng(r.pin.lat, r.pin.lng));
      // Pin tip is at (x, y); head circle centre is 24*PIN_SCALE above the tip.
      pinHeads.push({
        x: raw.x * RENDER_SCALE,
        y: raw.y * RENDER_SCALE - 24 * PIN_HEAD_SCALE,
      });
    }
    if (churchNearRegions && churchPin) {
      const raw = map.latLngToContainerPoint(L.latLng(churchPin.lat, churchPin.lng));
      pinHeads.push({
        x: raw.x * RENDER_SCALE,
        y: raw.y * RENDER_SCALE - 24 * PIN_HEAD_SCALE,
      });
    }

    // Number each polygon at its centroid so it can be cross-referenced with the
    // detail page that follows (PDF page order matches the regions array).
    const BADGE_RADIUS = 24 * UI_SCALE;
    drawable.forEach((r, idx) => {
      const cx = r.polygon.reduce((s, p) => s + p.lng, 0) / r.polygon.length;
      const cy = r.polygon.reduce((s, p) => s + p.lat, 0) / r.polygon.length;
      const pt = map!.latLngToContainerPoint(L.latLng(cy, cx));
      let x = pt.x * RENDER_SCALE;
      let y = pt.y * RENDER_SCALE;

      // If the badge overlaps any pin head, nudge it away from the nearest pin.
      const minDist = BADGE_RADIUS + PIN_HEAD_RADIUS + 4 * UI_SCALE;
      for (let pass = 0; pass < 4; pass++) {
        let nearest: { x: number; y: number } | null = null;
        let nearestD = Infinity;
        for (const ph of pinHeads) {
          const d = Math.hypot(ph.x - x, ph.y - y);
          if (d < minDist && d < nearestD) {
            nearest = ph;
            nearestD = d;
          }
        }
        if (!nearest) break;
        const dx = x - nearest.x;
        const dy = y - nearest.y;
        const len = Math.hypot(dx, dy) || 1;
        // Push along the away-vector to reach exactly minDist from this pin.
        const push = minDist - nearestD + 0.5;
        x += (dx / len) * push;
        y += (dy / len) * push;
      }

      const label = String(idx + 1);
      ctx.font = `bold ${Math.round(34 * UI_SCALE)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.beginPath();
      ctx.arc(x, y, BADGE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
      ctx.lineWidth = 3 * UI_SCALE;
      ctx.strokeStyle = r.status === 'done' ? DONE_COLOR : r.color;
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.fillText(label, x, y + 1 * UI_SCALE);
    });

    // Pins last so they sit above polygons, label tiles, and number badges.
    for (const r of drawable) {
      if (!r.pin) continue;
      const color = r.status === 'done' ? DONE_COLOR : r.color;
      drawPin(ctx, map, r, color, RENDER_SCALE);
    }
    if (churchNearRegions && churchPin) {
      drawPinAt(ctx, map, churchPin, CHURCH_PIN_COLOR, RENDER_SCALE, { cross: true });
    }

    return canvas.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY);
  } finally {
    map?.remove();
    container.remove();
  }
}

export async function captureRegion(region: Region, options?: CaptureRegionOptions): Promise<string> {
  if (region.polygon.length < 3) {
    throw new Error('Region polygon needs at least 3 points');
  }

  const satelliteBasemap = options?.satelliteBasemap ?? true;
  const tileCache = options?.tileCache;

  const container = makeOffscreenContainer();
  let map: L.Map | null = null;
  try {
    // preferCanvas: false → tiles rendered as <img> elements so we can read their src URLs
    map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: false,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
    });

    let baseLayer: L.TileLayer;
    let labelsLayer: L.TileLayer | null = null;

    ({ baseLayer, labelsLayer } = addPdfBasemapLayers(map, satelliteBasemap));

    const isDone = region.status === 'done';
    const color = isDone ? DONE_COLOR : region.color;
    const fillOpacity = 0;

    const b = polygonBounds(region.polygon);
    map.fitBounds(
      [
        [b.south, b.west],
        [b.north, b.east],
      ],
      { padding: [30, 30], maxZoom: 18 },
    );
    // fitBounds already caps at maxZoom:18 so small polygons reach zoom 18 (door numbers)
    // automatically. Only apply a floor to avoid extreme zoom-out on very large regions.
    if (map.getZoom() < 15) map.setZoom(15);

    const layersToWait = labelsLayer ? [baseLayer, labelsLayer] : [baseLayer];
    await Promise.all(layersToWait.map((layer) => waitForTiles(layer)));

    const canvas = document.createElement('canvas');
    canvas.width = CAPTURE_W;
    canvas.height = CAPTURE_H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, CAPTURE_W, CAPTURE_H);

    // Draw tiles layer by layer in order so labels always land on top of the satellite base.
    // Each tile is fetched as a blob: URL (same-origin) so drawing it on the canvas
    // does not taint it — canvas.toDataURL() works cleanly afterwards.
    // All positions are multiplied by RENDER_SCALE so tiles fill the larger canvas.
    const rootRect = map.getContainer().getBoundingClientRect();

    const drawLayerTiles = async (layer: L.TileLayer): Promise<void> => {
      const layerContainer = layer.getContainer();
      if (!layerContainer) return;
      const tileImgs = Array.from(layerContainer.querySelectorAll<HTMLImageElement>('img.leaflet-tile'));
      await Promise.all(
        tileImgs.map(async (imgEl) => {
          if (!imgEl.src) return;
          const blobImg = await fetchTileImage(imgEl.src, tileCache);
          if (!blobImg) return;
          const ir = imgEl.getBoundingClientRect();
          // Floor position, ceil size — tiles slightly overlap so no seam gaps appear.
          const dx = Math.floor((ir.left - rootRect.left) * RENDER_SCALE);
          const dy = Math.floor((ir.top - rootRect.top) * RENDER_SCALE);
          const dw = Math.ceil(ir.width * RENDER_SCALE);
          const dh = Math.ceil(ir.height * RENDER_SCALE);
          ctx.drawImage(blobImg, dx, dy, dw, dh);
        }),
      );
    };

    // Downscale hi-res tiles with high-quality smoothing; labels stay unfiltered.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (satelliteBasemap) {
      ctx.filter = SATELLITE_PDF_FILTER;
    }
    await drawLayerTiles(baseLayer);
    ctx.filter = 'none';

    // Draw polygon, then labels on top so street names remain readable over the fill.
    drawPolygonAndPin(ctx, map, region, color, fillOpacity, RENDER_SCALE);

    if (labelsLayer) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      await drawLayerTiles(labelsLayer);
    }

    // Auto-crop: find the vertical extent of the polygon in canvas coords,
    // then trim everything outside it plus a small padding.
    const pad = options?.cropPaddingPx ?? Math.round(60 * UI_SCALE);
    const polyYs = region.polygon.map(
      (p) => map.latLngToContainerPoint(L.latLng(p.lat, p.lng)).y * RENDER_SCALE,
    );
    const polyTop = Math.max(0, Math.min(...polyYs) - pad);
    const polyBottom = Math.min(CAPTURE_H, Math.max(...polyYs) + pad);
    const croppedH = polyBottom - polyTop;

    const cropped = document.createElement('canvas');
    cropped.width = CAPTURE_W;
    cropped.height = croppedH;
    const cropCtx = cropped.getContext('2d')!;
    cropCtx.imageSmoothingEnabled = true;
    cropCtx.imageSmoothingQuality = 'high';
    cropCtx.drawImage(canvas, 0, polyTop, CAPTURE_W, croppedH, 0, 0, CAPTURE_W, croppedH);

    // JPEG is significantly faster to encode and embed in PDF than PNG.
    // The canvas background is opaque (#e8e8e8) so no transparency is lost.
    return cropped.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY);
  } finally {
    map?.remove();
    container.remove();
  }
}
