import { useRegionStore } from '@/store/useRegionStore';

export function StatusBar() {
  const mode = useRegionStore((s) => s.mode);
  const pendingPinId = useRegionStore((s) => s.pendingPinForRegionId);
  const filePath = useRegionStore((s) => s.filePath);
  const regions = useRegionStore((s) => s.project.regions);
  const geocoding = useRegionStore((s) => s.geocodingIds.size);

  const pendingRegion = pendingPinId ? regions.find((r) => r.id === pendingPinId) : undefined;
  const pinDropIsMove = Boolean(pendingRegion?.pin);

  let modeText = 'Idle — click a region to select for PDF · right-click toggles done · shift+right-click deletes';
  if (mode === 'drawing') modeText = 'Drawing — click vertices, double-click to finish, Esc to cancel';
  if (mode === 'pin-drop')
    modeText = pinDropIsMove
      ? 'Move pin — click the correct location on the map; address will update'
      : 'Pin drop — click on a house inside the region';
  if (mode === 'church-pin')
    modeText = 'Church pin — click the church building on the map (Esc to cancel)';

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-panel px-3 py-1.5 text-xs text-muted">
      <span>{modeText}</span>
      <span className="flex items-center gap-3">
        {geocoding > 0 && <span>Geocoding ({geocoding})…</span>}
        <span>{regions.length} regions</span>
        <span className="truncate max-w-[40ch]" title={filePath ?? ''}>
          {filePath ?? 'unsaved'}
        </span>
      </span>
    </div>
  );
}
