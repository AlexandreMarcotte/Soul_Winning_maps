import { MapPinned } from 'lucide-react';
import { MAP_CITIES, nearestMapCity, type MapCityId } from '@/lib/mapCities';
import { useRegionStore } from '@/store/useRegionStore';

export function CitySwitcher() {
  const mapCenter = useRegionStore((s) => s.project.mapCenter);
  const setMapView = useRegionStore((s) => s.setMapView);
  const active = nearestMapCity(mapCenter);

  const onChange = (id: MapCityId): void => {
    const city = MAP_CITIES.find((c) => c.id === id);
    if (!city) return;
    setMapView(city.center, city.zoom);
  };

  return (
    <label
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink"
      title="Jump the map to a city"
    >
      <MapPinned size={14} className="text-muted" />
      <span className="sr-only">City</span>
      <select
        value={active.id}
        onChange={(e) => onChange(e.target.value as MapCityId)}
        className="max-w-[9.5rem] rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-ink focus:border-accent focus:outline-none"
      >
        {MAP_CITIES.map((city) => (
          <option key={city.id} value={city.id}>
            {city.label}
          </option>
        ))}
      </select>
    </label>
  );
}
