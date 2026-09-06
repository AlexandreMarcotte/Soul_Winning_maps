import { Church } from 'lucide-react';
import { useRegionStore } from '@/store/useRegionStore';

export function ChurchPinPrompt() {
  const mode = useRegionStore((s) => s.mode);
  const hasChurch = Boolean(useRegionStore((s) => s.project.churchPin));
  const setMode = useRegionStore((s) => s.setMode);

  if (mode !== 'church-pin') return null;

  return (
    <div
      className="pin-prompt pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border-2 border-amber-800 bg-white px-5 py-2.5 shadow-lg">
        <Church size={22} className="pin-prompt-icon text-amber-800" strokeWidth={2.5} />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-ink">
            {hasChurch ? 'Move church pin' : 'Place church pin'}
          </span>
          <span className="text-xs text-muted">Click the church building on the map</span>
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
