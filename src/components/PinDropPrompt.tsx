import { MapPin } from 'lucide-react';
import { useRegionStore } from '@/store/useRegionStore';

export function PinDropPrompt() {
  const mode = useRegionStore((s) => s.mode);
  const pendingPinId = useRegionStore((s) => s.pendingPinForRegionId);
  const regions = useRegionStore((s) => s.project.regions);
  const setMode = useRegionStore((s) => s.setMode);

  if (mode !== 'pin-drop' || !pendingPinId) return null;
  const region = regions.find((r) => r.id === pendingPinId);
  // Show only on first-time placement (not when repositioning an existing pin).
  if (!region || region.pin) return null;

  return (
    <div
      className="pin-prompt pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border-2 border-accent bg-white px-5 py-2.5 shadow-lg">
        <MapPin size={22} className="pin-prompt-icon text-accent" strokeWidth={2.5} />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-ink">Next step: place the pin</span>
          <span className="text-xs text-muted">Click a house inside the region you just drew</span>
        </div>
        <button
          type="button"
          onClick={() => setMode('idle')}
          className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium text-muted hover:bg-gray-100 hover:text-ink"
          title="Cancel (Esc)"
        >
          Esc
        </button>
      </div>
    </div>
  );
}
