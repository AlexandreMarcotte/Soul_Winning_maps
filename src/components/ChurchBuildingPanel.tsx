import { Church, MapPinned, Trash2 } from 'lucide-react';
import { ADDRESS_SEARCH_ZOOM } from '@/lib/geocode';
import { useRegionStore } from '@/store/useRegionStore';

/** Compact church building controls at the top of the sidebar. */
export function ChurchBuildingPanel() {
  const churchPin = useRegionStore((s) => s.project.churchPin);
  const churchAddress = useRegionStore((s) => s.project.churchAddress);
  const churchAddressShort = useRegionStore((s) => s.project.churchAddressShort);
  const mode = useRegionStore((s) => s.mode);
  const beginPlaceChurchPin = useRegionStore((s) => s.beginPlaceChurchPin);
  const clearChurchPin = useRegionStore((s) => s.clearChurchPin);
  const setMapView = useRegionStore((s) => s.setMapView);
  const setMode = useRegionStore((s) => s.setMode);

  const label = churchAddressShort || churchAddress || 'No church pin yet';
  const placing = mode === 'church-pin';

  return (
    <section className="border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <Church size={16} className="shrink-0 text-amber-800" />
        <h2 className="text-sm font-semibold text-ink">Church building</h2>
      </div>
      <p className="mt-1 truncate text-xs text-muted" title={churchAddress || undefined}>
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => (placing ? setMode('idle') : beginPlaceChurchPin())}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            placing
              ? 'bg-amber-800/10 text-amber-900'
              : 'text-ink hover:bg-gray-100'
          }`}
        >
          <MapPinned size={12} />
          {churchPin ? (placing ? 'Cancel' : 'Move pin') : placing ? 'Cancel' : 'Place pin'}
        </button>
        {churchPin && (
          <>
            <button
              type="button"
              onClick={() => setMapView(churchPin, ADDRESS_SEARCH_ZOOM)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink hover:bg-gray-100"
            >
              Go to
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Remove the church building pin?')) clearChurchPin();
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </>
        )}
      </div>
    </section>
  );
}
