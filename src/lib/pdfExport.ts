import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { LatLng, Region } from '@/types/region';
import { captureOverview, captureRegion } from './mapCapture';

/**
 * Run `fn` over all items with at most `concurrency` tasks running at once,
 * preserving result order.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const queue = items.map((item, i) => ({ item, i }));
  let pos = 0;
  async function worker(): Promise<void> {
    while (pos < queue.length) {
      const { item, i } = queue[pos++];
      results[i] = await fn(item, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export interface ExportPdfOptions {
  satelliteBasemap?: boolean;
  churchPin?: LatLng | null;
}

const PAGE_W = 612; // Letter portrait, in points
const PAGE_H = 792;
const MARGIN = 36;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Build a Google Maps URL for the region (pin coords preferred, address fallback). */
function googleMapsUrl(region: Region): string {
  if (region.pin) return `https://www.google.com/maps?q=${region.pin.lat},${region.pin.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(region.address ?? '')}`;
}

/** Render a QR code to a PNG data URL. */
async function makeQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 128, color: { dark: '#1e293b', light: '#ffffff' } });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 0.15, g: 0.15, b: 0.15 };
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

export async function exportRegionsToPdf(
  regions: Region[],
  options?: ExportPdfOptions,
): Promise<Uint8Array> {
  const satelliteBasemap = options?.satelliteBasemap ?? true;
  const churchPin = options?.churchPin ?? null;

  const pdf = await PDFDocument.create();
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // Single timestamp shared by every page footer so multi-page exports stay consistent.
  const exportedDate = new Date();
  const exportedLabel = `Exported ${exportedDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;
  const drawFooter = (page: ReturnType<typeof pdf.addPage>): void => {
    page.drawText(exportedLabel, {
      x: MARGIN,
      y: MARGIN / 2,
      size: 8,
      font,
      color: rgb(0.55, 0.58, 0.62),
    });
  };

  // Shared tile cache so adjacent regions reuse already-fetched tiles.
  const tileCache = new Map<string, Promise<HTMLImageElement | null>>();

  // Capture all regions in parallel (max 2 at once) then build PDF pages in order.
  const dataUrls = await runWithConcurrency(regions, 2, (region) =>
    captureRegion(region, { satelliteBasemap, tileCache }),
  );

  // Overview page — single map of every exported region, numbered to match the
  // detail pages that follow. Skipped if no region has a usable polygon.
  const drawableForOverview = regions.filter((r) => r.polygon.length >= 3);
  if (drawableForOverview.length > 0) {
    const overviewUrl = await captureOverview(drawableForOverview, {
      satelliteBasemap,
      tileCache,
      churchPin,
    });
    const overviewImg = await pdf.embedJpg(dataUrlToBytes(overviewUrl));
    const page = pdf.addPage([PAGE_W, PAGE_H]);

    page.drawText('Overview', {
      x: MARGIN,
      y: PAGE_H - MARGIN - 12,
      size: 18,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.21),
    });
    page.drawText(`${drawableForOverview.length} regions`, {
      x: MARGIN,
      y: PAGE_H - MARGIN - 30,
      size: 10,
      font,
      color: rgb(0.42, 0.45, 0.5),
    });

    const dividerY = PAGE_H - MARGIN - 50;
    page.drawLine({
      start: { x: MARGIN, y: dividerY },
      end: { x: PAGE_W - MARGIN, y: dividerY },
      thickness: 0.5,
      color: rgb(0.85, 0.87, 0.9),
    });

    const imgBoxX = MARGIN;
    const imgBoxBottom = MARGIN;
    const imgBoxTop = dividerY - 10;
    const imgBoxW = PAGE_W - 2 * MARGIN;
    const imgBoxH = imgBoxTop - imgBoxBottom;

    const ratio = overviewImg.width / overviewImg.height;
    let drawW = imgBoxW;
    let drawH = drawW / ratio;
    if (drawH > imgBoxH) {
      drawH = imgBoxH;
      drawW = drawH * ratio;
    }
    const drawX = imgBoxX + (imgBoxW - drawW) / 2;
    const drawY = imgBoxTop - drawH;
    page.drawImage(overviewImg, { x: drawX, y: drawY, width: drawW, height: drawH });
    drawFooter(page);
  }

  for (let idx = 0; idx < regions.length; idx++) {
    const region = regions[idx];
    const img = await pdf.embedJpg(dataUrlToBytes(dataUrls[idx]));

    const qrDataUrl = await makeQrDataUrl(googleMapsUrl(region));
    const qrImg = await pdf.embedPng(dataUrlToBytes(qrDataUrl));

    const page = pdf.addPage([PAGE_W, PAGE_H]);

    // Pin glyph - teardrop map-pin shape (same as the on-screen marker).
    const pinX = MARGIN + 8;
    const pinY = PAGE_H - MARGIN - 18;
    const scale = 0.65; // 24×36 SVG → ~15.6×23.4 pts
    const accent = hexToRgb(region.status === 'done' ? '#6B7280' : region.color);
    // x/y position the SVG origin so the circle head (SVG 12,12) stays centred on pinX/pinY.
    page.drawSvgPath(
      'M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.373 18.627 0 12 0z',
      {
        x: pinX - 12 * scale,
        y: pinY + 12 * scale,
        scale,
        color: rgb(accent.r, accent.g, accent.b),
        strokeColor: rgb(1, 1, 1),
        strokeWidth: 0.5,
      },
    );
    // White inner dot
    page.drawCircle({ x: pinX, y: pinY, size: 4 * scale, color: rgb(1, 1, 1) });

    // QR code — top-right of the header, spanning the full header height.
    const QR_SIZE = 44;
    const qrX = PAGE_W - MARGIN - QR_SIZE;
    const qrY = PAGE_H - MARGIN - QR_SIZE; // bottom aligns with divider area
    page.drawImage(qrImg, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE });

    // Number badge — same styling as the overview, placed just left of the QR code.
    // The index here matches the overview numbering (regions array order).
    const BADGE_R = 14;
    const badgeCx = qrX - BADGE_R - 10;
    const badgeCy = qrY + QR_SIZE / 2;
    page.drawCircle({
      x: badgeCx,
      y: badgeCy,
      size: BADGE_R,
      color: rgb(1, 1, 1),
      borderColor: rgb(accent.r, accent.g, accent.b),
      borderWidth: 1.5,
    });
    const badgeLabel = String(idx + 1);
    const badgeFontSize = 14;
    const badgeTextW = fontBold.widthOfTextAtSize(badgeLabel, badgeFontSize);
    page.drawText(badgeLabel, {
      x: badgeCx - badgeTextW / 2,
      y: badgeCy - badgeFontSize / 2 + 1.5,
      size: badgeFontSize,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.21),
    });

    // Address header (maxWidth leaves room for the badge + QR code)
    const textMaxW = badgeCx - BADGE_R - (pinX + 18) - 8;
    const addressShort = region.addressShort ?? region.address ?? 'Unaddressed';
    const addressFull = region.address ?? '';
    page.drawText(addressShort, {
      x: pinX + 18,
      y: pinY - 5,
      size: 18,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.21),
      maxWidth: textMaxW,
    });

    if (addressFull && addressFull !== addressShort) {
      page.drawText(addressFull, {
        x: pinX + 18,
        y: pinY - 22,
        size: 9,
        font,
        color: rgb(0.42, 0.45, 0.5),
        maxWidth: textMaxW,
      });
    }

    // Divider line
    const dividerY = PAGE_H - MARGIN - 50;
    page.drawLine({
      start: { x: MARGIN, y: dividerY },
      end: { x: PAGE_W - MARGIN, y: dividerY },
      thickness: 0.5,
      color: rgb(0.85, 0.87, 0.9),
    });

    // Map image, fit-contain into the body box
    const imgBoxX = MARGIN;
    const imgBoxBottom = MARGIN + 24; // leave room for footer
    const imgBoxTop = dividerY - 10;
    const imgBoxW = PAGE_W - 2 * MARGIN;
    const imgBoxH = imgBoxTop - imgBoxBottom;

    const ratio = img.width / img.height;
    let drawW = imgBoxW;
    let drawH = drawW / ratio;
    if (drawH > imgBoxH) {
      drawH = imgBoxH;
      drawW = drawH * ratio;
    }
    const drawX = imgBoxX + (imgBoxW - drawW) / 2;
    const drawY = imgBoxTop - drawH; // align image to top of box, just below divider

    page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });

    drawFooter(page);
  }

  return await pdf.save();
}
