/** Distinct from region palette colors and the blue address-search marker. */
export const CHURCH_PIN_COLOR = '#9A3412';

/** Leaflet / canvas teardrop with a cross so the church is easy to spot. */
export function churchPinSvgHtml(width = 28, height = 42): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${width}" height="${height}" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45))">
  <path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.373 18.627 0 12 0z" fill="${CHURCH_PIN_COLOR}"/>
  <rect x="11" y="5.5" width="2" height="11" rx="0.5" fill="white"/>
  <rect x="8" y="8" width="8" height="2" rx="0.5" fill="white"/>
</svg>`;
}
