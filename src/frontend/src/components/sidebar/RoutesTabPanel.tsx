import { Search } from 'lucide-react';
import RouteListItem from '@/components/RouteListItem';
import { DEFAULT_FILTERS, type FilterState } from '@/components/RouteFilter';
import { computeReadiness } from '@/lib/readiness';
import type { Route as RouteData } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import { buttonSecondary, buttonSize } from '@/lib/ui';

interface RoutesTabPanelProps {
  routes: RouteData[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showSave: boolean;
  isSaved: (id: string) => boolean;
  onToggleSave: (place: Omit<SavedPlace, 'savedAt'>) => void;
  onRouteClick: (route: RouteData) => void;
  readinessByRoute: Record<string, ReturnType<typeof computeReadiness>>;
  showDistanceFromUser: boolean;
}

export default function RoutesTabPanel({
  routes,
  searchQuery,
  onSearchQueryChange,
  filters,
  onFiltersChange,
  showSave,
  isSaved,
  onToggleSave,
  onRouteClick,
  readinessByRoute,
  showDistanceFromUser,
}: RoutesTabPanelProps) {
  const list = routes.filter(
    (r) => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // "Try adjusting your filters" used to show even when no filters were set
  // and the search simply found nothing near the user. Name the actual
  // cause and offer the way out.
  if (list.length === 0) {
    const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
        <Search aria-hidden="true" className="h-6 w-6 text-slate-600" />
        {searchQuery ? (
          <>
            <p className="text-xs font-medium text-slate-400">No routes match “{searchQuery}”</p>
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className={`${buttonSecondary} ${buttonSize.sm} mt-1`}
            >
              Clear search
            </button>
          </>
        ) : filtersActive ? (
          <>
            <p className="text-xs font-medium text-slate-400">No routes match your filters</p>
            <button
              type="button"
              onClick={() => onFiltersChange(DEFAULT_FILTERS)}
              className={`${buttonSecondary} ${buttonSize.sm} mt-1`}
            >
              Clear filters
            </button>
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-slate-400">No routes found near here</p>
            <p className="text-[10px] text-slate-600">Try searching for a different area.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {list.map((route, idx) => (
        <RouteListItem
          key={route.id}
          route={route}
          index={idx}
          showSave={showSave}
          isSaved={isSaved(route.id)}
          onToggleSave={() =>
            onToggleSave({
              id: route.id,
              type: 'route',
              name: route.name,
              coordinates: route.coordinates,
              difficulty: route.difficulty,
              activity_type: route.activity_type,
              distance_km: route.distance_km,
              elevation_gain_m: route.elevation_gain_m ?? undefined,
              photos: route.photos,
              place_id: route.place_id,
            })
          }
          onClick={() => onRouteClick(route)}
          readiness={readinessByRoute[route.id]}
          showDistanceFromUser={showDistanceFromUser}
        />
      ))}
    </>
  );
}
