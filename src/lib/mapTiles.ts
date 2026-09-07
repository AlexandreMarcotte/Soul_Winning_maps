/**
 * Shared raster URLs: Esri imagery + CARTO “labels only” overlay (OSM-based street/place names).
 * Pattern matches common Leaflet examples (satellite base + transparent label tiles on top).
 */

export const ESRI_WORLD_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/**
 * Transparent PNG tiles with roads and labels only — use above imagery or another base.
 * @2x returns a 512×512 image for the same z/x/y cell as a normal 256px tile (crisper text).
 * Use default Leaflet tileSize (256) — do not pair with tileSize:512 / zoomOffset:-1.
 */
export const CARTO_VOYAGER_LABELS_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png';

/** Default OpenStreetMap raster (labels baked into tiles). */
export const OSM_STANDARD_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Single-line attribution for PDF footer (imagery + label data). */
export const PDF_MAP_ATTRIBUTION =
  '© OpenStreetMap contributors © CARTO · Imagery © Esri';

/** PDF footer when exporting the OSM street basemap only. */
export const PDF_STREET_ATTRIBUTION = '© OpenStreetMap contributors';
