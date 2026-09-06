import { useEffect, useId, useRef, useState } from 'react';
import { Church, Loader2, MapPin, Search, X } from 'lucide-react';
import {
  ADDRESS_SEARCH_ZOOM,
  searchAddress,
  type AddressSearchResult,
} from '@/lib/geocode';
import { useRegionStore } from '@/store/useRegionStore';

export function AddressSearch() {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const setMapView = useRegionStore((s) => s.setMapView);
  const setSearchMarker = useRegionStore((s) => s.setSearchMarker);
  const setChurchPin = useRegionStore((s) => s.setChurchPin);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const runSearch = async (value: string): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setOpen(false);
      return;
    }

    setLoading(true);
    setError(null);
    setActiveIndex(-1);
    try {
      const found = await searchAddress(trimmed);
      setResults(found);
      setOpen(true);
      if (found.length === 0) setError('No addresses found');
    } catch {
      setResults([]);
      setError('Search failed — try again');
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const selectResult = (r: AddressSearchResult): void => {
    setQuery(r.short);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
    setSearchMarker({ lat: r.lat, lng: r.lng });
    setMapView({ lat: r.lat, lng: r.lng }, ADDRESS_SEARCH_ZOOM);
  };

  const setAsChurch = (r: AddressSearchResult): void => {
    setQuery(r.short);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
    setChurchPin({ lat: r.lat, lng: r.lng }, r.display, r.short);
    setMapView({ lat: r.lat, lng: r.lng }, ADDRESS_SEARCH_ZOOM);
  };

  const clear = (): void => {
    setQuery('');
    setResults([]);
    setError(null);
    setOpen(false);
    setActiveIndex(-1);
    setSearchMarker(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      if (open) {
        setOpen(false);
        e.stopPropagation();
      } else if (query) {
        clear();
        e.stopPropagation();
      }
      return;
    }

    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % results.length);
      return;
    }

    if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && activeIndex >= 0 && results[activeIndex]) {
        selectResult(results[activeIndex]);
      } else {
        void runSearch(query);
      }
    }
  };

  return (
    <div ref={rootRef} className="relative w-72 shrink-0">
      <label className="sr-only" htmlFor={listId}>
        Find address
      </label>
      <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 focus-within:border-accent">
        <Search size={14} className="shrink-0 text-muted" aria-hidden />
        <input
          ref={inputRef}
          id={listId}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          onFocus={() => {
            if (results.length > 0 || error) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Find address…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
        />
        {loading && <Loader2 size={14} className="shrink-0 animate-spin text-muted" aria-hidden />}
        {query && !loading && (
          <button
            type="button"
            onClick={clear}
            className="rounded p-0.5 text-muted hover:bg-gray-100 hover:text-ink"
            title="Clear"
            aria-label="Clear address search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (results.length > 0 || error) && (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[1100] mt-1 max-h-64 overflow-auto rounded-md border border-gray-200 bg-panel py-1 shadow-panel"
        >
          {error && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{error}</li>
          ) : (
            results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${r.display}`}>
                <div
                  className={`flex items-start gap-1 px-1 py-1 ${
                    i === activeIndex ? 'bg-accent/10' : ''
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    onClick={() => selectResult(r)}
                    className={`flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      i === activeIndex ? 'text-accent' : 'text-ink hover:bg-gray-50'
                    }`}
                  >
                    <MapPin size={14} className="mt-0.5 shrink-0 opacity-70" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug">{r.short}</span>
                      <span className="block truncate text-xs text-muted">{r.display}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsChurch(r)}
                    className="mt-1 shrink-0 rounded-md p-1.5 text-amber-800 hover:bg-amber-50"
                    title="Set as church building"
                    aria-label={`Set ${r.short} as church building`}
                  >
                    <Church size={16} />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
