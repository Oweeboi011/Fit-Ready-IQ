import { Search, Sparkles, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import RouteListItem from '@/components/RouteListItem';
import { DEFAULT_FILTERS, type FilterState } from '@/components/RouteFilter';
import { computeReadiness, type Readiness } from '@/lib/readiness';
import { bandRecommendations } from '@/lib/readinessRecommender';
import type { Route as RouteData } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import { buttonSecondary, buttonSize } from '@/lib/ui';

/**
 * Stands in for a route the page has not scored. Its `null` score keeps it out
 * of both bands, which is the same treatment a genuinely unscoreable route gets.
 */
const UNSCORED: Readiness = {
  level: 'unknown',
  score: null,
  label: 'Not enough data',
  summary: '',
  factors: [],
  incomplete: true,
};

/** A titled group above the full list. Presentational only. */
function Band({
  title,
  hint,
  Icon,
  tone,
  children,
}: {
  title: string;
  hint: string;
  Icon: typeof Sparkles;
  tone: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="mb-2">
      <div className="px-1 pb-1.5 pt-1">
        <p
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}
        >
          <Icon aria-hidden="true" className="h-3 w-3" />
          {title}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>
      </div>
      {children}
    </section>
  );
}

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
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink/10 px-4 py-10 text-center">
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

  // Readiness, asked the other way round. The scores are already computed for
  // the badges; banding them turns "am I ready for this?" into "what can I do?"
  // without another pass over the scorer. Silent when there is no training data,
  // because then every score is `unknown` and both bands come back empty.
  const { ready, stretch } = bandRecommendations(
    list.map((route) => ({
      item: route,
      demand: { distanceKm: route.distance_km, ascentM: route.elevation_gain_m ?? null },
      readiness: readinessByRoute[route.id] ?? UNSCORED,
    })),
    { limit: 3 }
  );

  const renderItem = (route: RouteData, idx: number) => (
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
  );

  return (
    <>
      {ready.length > 0 && (
        <Band
          title="Ready for you"
          hint="The biggest of these you can finish on your current training."
          Icon={Sparkles}
          tone="text-emerald-300"
        >
          {ready.map((r, idx) => renderItem(r.item, idx))}
        </Band>
      )}

      {stretch.length > 0 && (
        <Band
          title="Your next step up"
          hint="Not yet — but close enough to train for."
          Icon={TrendingUp}
          tone="text-amber-300"
        >
          {stretch.map((r, idx) => renderItem(r.item, idx))}
        </Band>
      )}

      {(ready.length > 0 || stretch.length > 0) && (
        <p className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          All routes nearby
        </p>
      )}

      {list.map(renderItem)}
    </>
  );
}
