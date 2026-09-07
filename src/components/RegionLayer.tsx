import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useRegionStore } from '@/store/useRegionStore';
import { heatmapColor } from '@/lib/heatmap';
import { centroid, haversineMeters, insetLatLngRing } from '@/lib/geometry';
import type { Region } from '@/types/region';

interface Props {
  map: L.Map;
}

const DONE_COLOR = '#6B7280';
const DONE_HATCH_PATTERN_ID = 'map-soulwinning-done-hatch';

/** Half the stroke width in meters at the current zoom (for inward perimeter offset). */
function halfStrokeMeters(map: L.Map, weightPx: number): number {
  const a = map.containerPointToLatLng(L.point(0, 0));
  const b = map.containerPointToLatLng(L.point(0, weightPx / 2));
  return Math.max(0.25, haversineMeters(a, b));
}

/** SVG defs for diagonal dashed hatch inside done polygons (same document as paths). */
function ensureDoneHatchDefs(svg: SVGSVGElement | null): void {
  if (!svg || svg.querySelector(`#${DONE_HATCH_PATTERN_ID}`)) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pattern.setAttribute('id', DONE_HATCH_PATTERN_ID);
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('width', '12');
  pattern.setAttribute('height', '12');
  pattern.setAttribute('patternTransform', 'rotate(38)');

  const base = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  base.setAttribute('width', '12');
  base.setAttribute('height', '12');
  base.setAttribute('fill', DONE_COLOR);
  base.setAttribute('fill-opacity', '0.18');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '0');
  line.setAttribute('y1', '6');
  line.setAttribute('x2', '12');
  line.setAttribute('y2', '6');
  line.setAttribute('stroke', DONE_COLOR);
  line.setAttribute('stroke-width', '1.8');
  line.setAttribute('stroke-opacity', '0.75');

  pattern.appendChild(base);
  pattern.appendChild(line);
  defs.appendChild(pattern);
  svg.insertBefore(defs, svg.firstChild);
}

function styleFor(
  r: Region,
  heatmap: { enabled: boolean; max: number },
  hovered: boolean,
): L.PathOptions {
  const hoverWeightBoost = hovered ? 3 : 0;
  const selectedBoost = r.selectedForPdf ? 2 : 0;
  if (heatmap.enabled) {
    const color = heatmapColor(r.soulsSaved, heatmap.max);
    return {
      color,
      weight: (r.selectedForPdf ? 5 : 3) + hoverWeightBoost,
      fillColor: color,
      fillOpacity: hovered ? 0.55 : r.selectedForPdf ? 0.4 : 0.28,
      dashArray: r.selectedForPdf ? '6 6' : undefined,
    };
  }
  if (r.status === 'done') {
    return {
      color: DONE_COLOR,
      weight: (r.selectedForPdf ? 5 : 3) + hoverWeightBoost,
      fillColor: `url(#${DONE_HATCH_PATTERN_ID})`,
      fillOpacity: 1,
      // Dashed stroke + PDF selection can use slightly longer dashes for emphasis
      dashArray: r.selectedForPdf ? '10 6' : '8 6',
    };
  }
  return {
    color: r.color,
    weight: 3 + selectedBoost + hoverWeightBoost,
    fillColor: r.color,
    // Keep fills light so streets stay readable, but strong enough to see on satellite.
    fillOpacity: hovered ? 0.4 : r.selectedForPdf ? 0.28 : 0.16,
    dashArray: r.selectedForPdf ? '6 6' : undefined,
  };
}

function makeSoulsLabelIcon(value: number): L.DivIcon {
  const html = `<div style="
    font: 700 22px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.6);
    text-align: center;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
  ">${value}</div>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [60, 24],
    iconAnchor: [30, 12],
  });
}

export function RegionLayer({ map }: Props) {
  const regions = useRegionStore((s) => s.project.regions);
  const mode = useRegionStore((s) => s.mode);
  const hoveredRegionId = useRegionStore((s) => s.hoveredRegionId);
  const hoveredGroupId = useRegionStore((s) => s.hoveredGroupId);
  const heatmapEnabled = useRegionStore((s) => s.heatmapEnabled);
  const heatmapCap = useRegionStore((s) => s.heatmapCap);
  const toggleSelected = useRegionStore((s) => s.toggleSelected);
  const setRegionStatus = useRegionStore((s) => s.setRegionStatus);
  const removeRegion = useRegionStore((s) => s.removeRegion);

  const polyRefs = useRef<Map<string, L.Polygon>>(new Map());
  const strokeRefs = useRef<Map<string, L.Polygon>>(new Map());
  const pinRefs = useRef<Map<string, L.Marker>>(new Map());
  const labelRefs = useRef<Map<string, L.Marker>>(new Map());
  const svgRendererRef = useRef<L.SVG | null>(null);
  const svgRendererMapRef = useRef<L.Map | null>(null);

  const autoMax = useMemo(
    () => regions.reduce((m, r) => (r.soulsSaved > m ? r.soulsSaved : m), 0),
    [regions],
  );
  const effectiveMax = heatmapCap != null && heatmapCap > 0 ? heatmapCap : autoMax;
  const heatmap = { enabled: heatmapEnabled, max: effectiveMax };

  // Sync polygons + markers
  useEffect(() => {
    const polyMap = polyRefs.current;
    const strokeMap = strokeRefs.current;
    const pinMap = pinRefs.current;
    const labelMap = labelRefs.current;
    const seen = new Set<string>();

    if (svgRendererMapRef.current !== map) {
      const svgRenderer = L.svg({ padding: 0.5 });
      svgRenderer.addTo(map); // triggers onAdd → sets _container
      svgRendererRef.current = svgRenderer;
      svgRendererMapRef.current = map;
      ensureDoneHatchDefs((svgRenderer as any)._container as SVGSVGElement | null);
    }
    const svgRenderer = svgRendererRef.current!;

    const syncRegionPaths = (r: Region): void => {
      const latlngs = r.polygon.map((p) => [p.lat, p.lng] as [number, number]);
      const hovered = hoveredRegionId === r.id || (hoveredGroupId != null && r.groupId === hoveredGroupId);
      const style = styleFor(r, heatmap, hovered);
      const weight = typeof style.weight === 'number' ? style.weight : 3;

      let poly = polyMap.get(r.id);
      const fillStyle: L.PathOptions = {
        ...style,
        stroke: false,
        renderer: svgRenderer,
      };
      if (!poly) {
        poly = L.polygon(latlngs, fillStyle).addTo(map);
        polyMap.set(r.id, poly);
      } else {
        poly.setLatLngs(latlngs);
        poly.setStyle(fillStyle);
      }

      // Stroke on an inward-offset ring so shared edges sit side-by-side by colour.
      const inset = insetLatLngRing(r.polygon, halfStrokeMeters(map, weight));
      const strokeLatLngs = inset.map((p) => [p.lat, p.lng] as [number, number]);
      const strokeStyle: L.PathOptions = {
        color: style.color,
        weight,
        fill: false,
        opacity: 1,
        dashArray: style.dashArray,
        lineJoin: 'round',
        interactive: false,
        renderer: svgRenderer,
      };
      let stroke = strokeMap.get(r.id);
      if (!stroke) {
        stroke = L.polygon(strokeLatLngs, strokeStyle).addTo(map);
        strokeMap.set(r.id, stroke);
      } else {
        stroke.setLatLngs(strokeLatLngs);
        stroke.setStyle(strokeStyle);
      }

      if (hovered) {
        poly.bringToFront();
        stroke.bringToFront();
      }
    };

    for (const r of regions) {
      seen.add(r.id);
      syncRegionPaths(r);

      // pin marker
      let pin = pinMap.get(r.id);
      if (r.pin) {
        const pinColor = heatmapEnabled
          ? heatmapColor(r.soulsSaved, effectiveMax)
          : r.status === 'done'
            ? DONE_COLOR
            : r.color;
        const html = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45))">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.373 18.627 0 12 0z" fill="${pinColor}"/>
          <circle cx="12" cy="12" r="5" fill="white" fill-opacity="0.9"/>
        </svg>`;
        const icon = L.divIcon({ html, className: '', iconSize: [24, 36], iconAnchor: [12, 36] });
        if (!pin) {
          pin = L.marker([r.pin.lat, r.pin.lng], { icon, interactive: false }).addTo(map);
          pinMap.set(r.id, pin);
        } else {
          pin.setLatLng([r.pin.lat, r.pin.lng]);
          pin.setIcon(icon);
        }
      } else if (pin) {
        map.removeLayer(pin);
        pinMap.delete(r.id);
      }

      // souls-saved label (only while heatmap is on)
      let label = labelMap.get(r.id);
      if (heatmapEnabled) {
        const c = centroid(r.polygon);
        const icon = makeSoulsLabelIcon(r.soulsSaved);
        if (!label) {
          label = L.marker([c.lat, c.lng], { icon, interactive: false, keyboard: false }).addTo(map);
          labelMap.set(r.id, label);
        } else {
          label.setLatLng([c.lat, c.lng]);
          label.setIcon(icon);
        }
      } else if (label) {
        map.removeLayer(label);
        labelMap.delete(r.id);
      }
    }

    // remove stale
    for (const [id, layer] of polyMap) {
      if (!seen.has(id)) {
        map.removeLayer(layer);
        polyMap.delete(id);
      }
    }
    for (const [id, layer] of strokeMap) {
      if (!seen.has(id)) {
        map.removeLayer(layer);
        strokeMap.delete(id);
      }
    }
    for (const [id, m] of pinMap) {
      if (!seen.has(id)) {
        map.removeLayer(m);
        pinMap.delete(id);
      }
    }
    for (const [id, m] of labelMap) {
      if (!seen.has(id)) {
        map.removeLayer(m);
        labelMap.delete(id);
      }
    }

    // Keep stroke inset matched to pixel weight when zoom changes.
    const onZoomEnd = (): void => {
      for (const r of regions) {
        if (!seen.has(r.id)) continue;
        const hovered = hoveredRegionId === r.id || (hoveredGroupId != null && r.groupId === hoveredGroupId);
        const style = styleFor(r, heatmap, hovered);
        const weight = typeof style.weight === 'number' ? style.weight : 3;
        const stroke = strokeMap.get(r.id);
        if (!stroke) continue;
        const inset = insetLatLngRing(r.polygon, halfStrokeMeters(map, weight));
        stroke.setLatLngs(inset.map((p) => [p.lat, p.lng] as [number, number]));
      }
    };
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomend', onZoomEnd);
    };
  }, [regions, map, heatmapEnabled, effectiveMax, hoveredRegionId, hoveredGroupId]);

  // Click handlers
  useEffect(() => {
    const polyMap = polyRefs.current;
    const cleanups: Array<() => void> = [];

    for (const r of regions) {
      const poly = polyMap.get(r.id);
      if (!poly) continue;

      const onClick = (e: L.LeafletMouseEvent): void => {
        if (mode !== 'idle') return;
        L.DomEvent.stopPropagation(e);
        toggleSelected(r.id);
      };
      const onContext = (e: L.LeafletMouseEvent): void => {
        L.DomEvent.stopPropagation(e);
        // Cycle: pending → done → pending; shift+right-click deletes
        if ((e.originalEvent as MouseEvent).shiftKey) {
          if (confirm(`Delete region "${r.addressShort ?? r.address}"?`)) removeRegion(r.id);
          return;
        }
        setRegionStatus(r.id, r.status === 'done' ? 'pending' : 'done');
      };

      poly.on('click', onClick);
      poly.on('contextmenu', onContext);
      cleanups.push(() => {
        poly.off('click', onClick);
        poly.off('contextmenu', onContext);
      });
    }
    return () => {
      for (const c of cleanups) c();
    };
  }, [regions, mode, toggleSelected, setRegionStatus, removeRegion]);

  return null;
}
