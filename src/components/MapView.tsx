import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { useRegionStore } from '@/store/useRegionStore';
import { RegionLayer } from './RegionLayer';
import { PinDropPrompt } from './PinDropPrompt';
import { ChurchPinPrompt } from './ChurchPinPrompt';
import { reverseGeocode, fallbackAddress } from '@/lib/geocode';
import { churchPinSvgHtml } from '@/lib/churchPin';
import { CARTO_VOYAGER_LABELS_URL, ESRI_WORLD_IMAGERY_URL, OSM_STANDARD_TILE_URL } from '@/lib/mapTiles';
import type { LatLng } from '@/types/region';

const STREET_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const SATELLITE_ATTR =
  'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const baseTileRef = useRef<L.TileLayer | null>(null);
  const labelsTileRef = useRef<L.TileLayer | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const churchMarkerRef = useRef<L.Marker | null>(null);
  // Prevent feedback loop: when we programmatically call setView, skip the moveend handler.
  const programmaticMoveRef = useRef(false);

  const mapCenter = useRegionStore((s) => s.project.mapCenter);
  const mapZoom = useRegionStore((s) => s.project.mapZoom);
  const satelliteBasemap = useRegionStore((s) => s.project.satelliteBasemap);
  const setSatelliteBasemap = useRegionStore((s) => s.setSatelliteBasemap);
  const searchMarker = useRegionStore((s) => s.searchMarker);
  const churchPin = useRegionStore((s) => s.project.churchPin);
  const setChurchPin = useRegionStore((s) => s.setChurchPin);
  const mode = useRegionStore((s) => s.mode);
  const pendingPinForRegionId = useRegionStore((s) => s.pendingPinForRegionId);
  const addRegion = useRegionStore((s) => s.addRegion);
  const setRegionPin = useRegionStore((s) => s.setRegionPin);
  const setRegionAddress = useRegionStore((s) => s.setRegionAddress);
  const startGeocoding = useRegionStore((s) => s.startGeocoding);
  const finishGeocoding = useRegionStore((s) => s.finishGeocoding);
  const setMapView = useRegionStore((s) => s.setMapView);
  const setMode = useRegionStore((s) => s.setMode);

  useEffect(() => {
    if (!containerRef.current) return;

    const mapInstance = L.map(containerRef.current, {
      center: [mapCenter.lat, mapCenter.lng],
      zoom: mapZoom,
      zoomControl: true,
      // Canvas default can leave vector overlays blank after map remounts (StrictMode/HMR).
      preferCanvas: false,
      attributionControl: false,
    });

    // Labels above basemap tiles, but below region polygons + pins so maps stay visible.
    mapInstance.createPane('streetLabels');
    const streetLabelsPane = mapInstance.getPane('streetLabels');
    if (streetLabelsPane) {
      streetLabelsPane.style.zIndex = '350';
      streetLabelsPane.style.pointerEvents = 'none';
    }

    // Geoman config
    mapInstance.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 20,
      finishOn: 'dblclick',
      allowSelfIntersection: false,
    });
    // Make sure Geoman's own toolbar is hidden (we have our own)
    mapInstance.pm.addControls({ position: 'topleft' });
    const ctrl = (mapInstance.pm as any).Toolbar?.options;
    if (ctrl) ctrl.position = 'topleft';
    (mapInstance.pm as any).Toolbar?.toggleControls?.();
    mapInstance.pm.removeControls();

    mapInstance.on('moveend', () => {
      if (programmaticMoveRef.current) return;
      const c = mapInstance.getCenter();
      setMapView({ lat: c.lat, lng: c.lng }, mapInstance.getZoom());
    });

    mapInstance.on('pm:create', (e: any) => {
      const layer = e.layer as L.Polygon;
      const latlngs = (layer.getLatLngs()[0] as L.LatLng[]).map((ll) => ({
        lat: ll.lat,
        lng: ll.lng,
      }));
      // Remove the layer Geoman added — we manage rendering ourselves via RegionLayer.
      mapInstance.removeLayer(layer);
      addRegion(latlngs);
    });

    setMap(mapInstance);

    // Leaflet doesn't detect container resize on its own (e.g. fullscreen toggle).
    const observer = new ResizeObserver(() => mapInstance.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      setMap(null);
      mapInstance.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync map view when project is loaded from file (mapCenter/mapZoom change externally).
  useEffect(() => {
    if (!map) return;
    programmaticMoveRef.current = true;
    map.setView([mapCenter.lat, mapCenter.lng], mapZoom, { animate: false });
    programmaticMoveRef.current = false;
  }, [map, mapCenter, mapZoom]);

  // Base map + optional street-label overlay (matches PDF capture: Esri + CARTO voyager_only_labels).
  useEffect(() => {
    if (!map) return;

    if (baseTileRef.current) map.removeLayer(baseTileRef.current);
    if (labelsTileRef.current) {
      map.removeLayer(labelsTileRef.current);
      labelsTileRef.current = null;
    }

    if (satelliteBasemap) {
      baseTileRef.current = L.tileLayer(ESRI_WORLD_IMAGERY_URL, {
        attribution: SATELLITE_ATTR,
        maxZoom: 19,
      }).addTo(map);
      // CARTO @2x tiles are still on the 256px z/x/y grid (just sharper images).
      // Do not set tileSize:512 / zoomOffset:-1 — that stretches labels ~2×.
      labelsTileRef.current = L.tileLayer(CARTO_VOYAGER_LABELS_URL, {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
        subdomains: 'abcd',
        pane: 'streetLabels',
      }).addTo(map);
    } else {
      baseTileRef.current = L.tileLayer(OSM_STANDARD_TILE_URL, { attribution: STREET_ATTR, maxZoom: 19 }).addTo(
        map,
      );
    }
  }, [map, satelliteBasemap]);

  // While actively drawing a polygon, Ctrl+Z removes the last placed vertex
  // (Geoman keeps in-progress vertices in its own state, not the store, so the
  // app-level undo can't touch them). We intercept on the capture phase and stop
  // propagation so the store undo in App doesn't also fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z')) return;
      if (!map || !map.pm.globalDrawModeEnabled()) return;
      const draw = (map.pm.Draw as any)?.Polygon;
      // Only act when at least one vertex has been placed. Geoman tracks placed
      // vertices in `_markers`; removeLastVertex disables the draw when ≤1 remain.
      if (!Array.isArray(draw?._markers) || draw._markers.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      draw._removeLastVertex();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [map]);

  // Toggle drawing mode based on store
  useEffect(() => {
    if (!map) return;
    if (mode === 'drawing') {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 20,
        finishOn: 'dblclick',
        allowSelfIntersection: false,
      });
    } else {
      if (map.pm.globalDrawModeEnabled()) map.pm.disableDraw();
    }
  }, [map, mode]);

  // Pin-drop interaction
  useEffect(() => {
    if (!map) return;
    if (mode !== 'pin-drop' || !pendingPinForRegionId) {
      containerRef.current?.classList.remove('pin-drop-cursor');
      return;
    }
    containerRef.current?.classList.add('pin-drop-cursor');
    const onClick = async (e: L.LeafletMouseEvent): Promise<void> => {
      const id = pendingPinForRegionId;
      const wasReposition = Boolean(
        useRegionStore.getState().project.regions.find((x) => x.id === id)?.pin,
      );
      const pin: LatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
      setRegionPin(id, pin);
      startGeocoding(id);
      try {
        const r = await reverseGeocode(pin);
        setRegionAddress(id, r.display, r.short);
      } catch {
        const fb = fallbackAddress(pin);
        setRegionAddress(id, fb.display, fb.short);
      } finally {
        finishGeocoding(id);
      }
      setMode(wasReposition ? 'idle' : 'drawing');
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
      containerRef.current?.classList.remove('pin-drop-cursor');
    };
  }, [map, mode, pendingPinForRegionId, setRegionPin, setRegionAddress, startGeocoding, finishGeocoding, setMode]);

  // Church pin placement / reposition via map click.
  useEffect(() => {
    if (!map) return;
    if (mode !== 'church-pin') {
      containerRef.current?.classList.remove('pin-drop-cursor');
      return;
    }
    containerRef.current?.classList.add('pin-drop-cursor');
    const onClick = async (e: L.LeafletMouseEvent): Promise<void> => {
      const pin: LatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
      try {
        const r = await reverseGeocode(pin);
        setChurchPin(pin, r.display, r.short);
      } catch {
        const fb = fallbackAddress(pin);
        setChurchPin(pin, fb.display, fb.short);
      }
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
      containerRef.current?.classList.remove('pin-drop-cursor');
    };
  }, [map, mode, setChurchPin]);

  // Temporary marker for address search results.
  useEffect(() => {
    if (!map) {
      searchMarkerRef.current = null;
      return;
    }

    if (!searchMarker) {
      if (searchMarkerRef.current) {
        map.removeLayer(searchMarkerRef.current);
        searchMarkerRef.current = null;
      }
      return;
    }

    const html = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45))">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.373 18.627 0 12 0z" fill="#2563EB"/>
      <circle cx="12" cy="12" r="5" fill="white" fill-opacity="0.95"/>
    </svg>`;
    const icon = L.divIcon({ html, className: '', iconSize: [28, 42], iconAnchor: [14, 42] });

    if (!searchMarkerRef.current || !(map as any).hasLayer?.(searchMarkerRef.current)) {
      if (searchMarkerRef.current) {
        try {
          searchMarkerRef.current.remove();
        } catch {
          /* old map may already be gone */
        }
      }
      searchMarkerRef.current = L.marker([searchMarker.lat, searchMarker.lng], {
        icon,
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      searchMarkerRef.current.setLatLng([searchMarker.lat, searchMarker.lng]);
      searchMarkerRef.current.setIcon(icon);
    }
  }, [map, searchMarker]);

  // Persisted church building pin.
  useEffect(() => {
    if (!map) {
      churchMarkerRef.current = null;
      return;
    }

    if (!churchPin) {
      if (churchMarkerRef.current) {
        map.removeLayer(churchMarkerRef.current);
        churchMarkerRef.current = null;
      }
      return;
    }

    const icon = L.divIcon({
      html: churchPinSvgHtml(30, 45),
      className: '',
      iconSize: [30, 45],
      iconAnchor: [15, 45],
    });

    if (!churchMarkerRef.current || !(map as any).hasLayer?.(churchMarkerRef.current)) {
      if (churchMarkerRef.current) {
        try {
          churchMarkerRef.current.remove();
        } catch {
          /* old map may already be gone */
        }
      }
      churchMarkerRef.current = L.marker([churchPin.lat, churchPin.lng], {
        icon,
        interactive: false,
        zIndexOffset: 900,
      }).addTo(map);
    } else {
      churchMarkerRef.current.setLatLng([churchPin.lat, churchPin.lng]);
      churchMarkerRef.current.setIcon(icon);
    }
  }, [map, churchPin]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {map && <RegionLayer map={map} />}
      <PinDropPrompt />
      <ChurchPinPrompt />
      <button
        onClick={() => setSatelliteBasemap(!satelliteBasemap)}
        className="absolute bottom-8 right-2 z-[1000] bg-white border border-gray-300 rounded shadow px-2 py-1 text-xs font-medium hover:bg-gray-50"
        title="Toggle satellite view"
      >
        {satelliteBasemap ? 'Street' : 'Satellite'}
      </button>
    </>
  );
}
