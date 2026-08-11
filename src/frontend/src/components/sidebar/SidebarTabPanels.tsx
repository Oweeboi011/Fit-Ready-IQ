import RouteFilter, { type FilterState } from '@/components/RouteFilter';
import RoutesTabPanel from '@/components/sidebar/RoutesTabPanel';
import MountainsTabPanel from '@/components/sidebar/MountainsTabPanel';
import CampsitesTabPanel from '@/components/sidebar/CampsitesTabPanel';
import HistoryTabPanel from '@/components/sidebar/HistoryTabPanel';
import SavedTabPanel from '@/components/sidebar/SavedTabPanel';
import type { TabId } from '@/components/sidebar/SidebarTabs';
import { computeReadiness } from '@/lib/readiness';
import type { Activity } from '@/lib/activityTypes';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import type { CollectionName } from '@/lib/usePlacesData';
import { buttonGhost, buttonSecondary, buttonSize } from '@/lib/ui';

interface SidebarTabPanelsProps {
  activeTab: TabId;
  isLoading: boolean;
  error: string | null;
  onRetryPlaces: () => void;
  elevationUnavailable: boolean;
  failedCollections: CollectionName[];
  collectionLabels: Record<CollectionName, string>;
  filteredRoutes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  routes: RouteData[];
  savedPlaces: SavedPlace[];
  activities: Activity[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showSave: boolean;
  isSaved: (id: string) => boolean;
  onToggleSave: (place: Omit<SavedPlace, 'savedAt'>) => void;
  onRouteClick: (route: RouteData) => void;
  onMountainClick: (mountain: MountainData) => void;
  onCampsiteClick: (campsite: Campsite) => void;
  onActivityClick: (activity: Activity) => void;
  readinessByRoute: Record<string, ReturnType<typeof computeReadiness>>;
  showDistanceFromUser: boolean;
  stravaSyncState: 'idle' | 'syncing' | 'synced' | 'failed';
  onConnectDevices: () => void;
}

export default function SidebarTabPanels(props: SidebarTabPanelsProps) {
  const {
    activeTab,
    isLoading,
    error,
    onRetryPlaces,
    elevationUnavailable,
    failedCollections,
    collectionLabels,
    filteredRoutes,
    mountains,
    campsites,
    routes,
    savedPlaces,
    activities,
    searchQuery,
    onSearchQueryChange,
    filters,
    onFiltersChange,
    showSave,
    isSaved,
    onToggleSave,
    onRouteClick,
    onMountainClick,
    onCampsiteClick,
    onActivityClick,
    readinessByRoute,
    showDistanceFromUser,
    stravaSyncState,
    onConnectDevices,
  } = props;

  return (
    <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="contents">
      {/* Filters — only for routes tab */}
      {activeTab === 'routes' && <RouteFilter filters={filters} onFilterChange={onFiltersChange} />}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-white/5 p-3.5">
              <div className="flex items-start gap-3">
                <div className="skeleton h-14 w-14 flex-shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-3/4 rounded-md" />
                  <div className="skeleton h-2.5 w-1/2 rounded-md" />
                  <div className="skeleton h-2.5 w-2/3 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-xs font-medium text-red-300">{error}</p>
          <button
            type="button"
            onClick={onRetryPlaces}
            className={`${buttonSecondary} ${buttonSize.sm} mt-2.5`}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {elevationUnavailable && (
            <div
              role="status"
              className="mb-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5"
            >
              <p className="text-[11px] leading-relaxed text-amber-100">
                Elevation data is unavailable right now, so climbs and gains are shown as
                &ldquo;—&rdquo; rather than guessed.
              </p>
            </div>
          )}

          {/* Partial failure: some collections came back, some did not.
            Without this the empty tab reads as "nothing here". */}
          {failedCollections.length > 0 && (
            <div
              role="status"
              className="mb-1.5 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5"
            >
              <p className="flex-1 text-[11px] text-amber-100">
                We couldn&apos;t load{' '}
                {failedCollections.map((c) => collectionLabels[c]).join(' or ')}.
              </p>
              <button
                type="button"
                onClick={onRetryPlaces}
                className={`${buttonGhost} ${buttonSize.sm}`}
              >
                Retry
              </button>
            </div>
          )}

          {activeTab === 'routes' && (
            <RoutesTabPanel
              routes={filteredRoutes}
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              filters={filters}
              onFiltersChange={onFiltersChange}
              showSave={showSave}
              isSaved={isSaved}
              onToggleSave={onToggleSave}
              onRouteClick={onRouteClick}
              readinessByRoute={readinessByRoute}
              showDistanceFromUser={showDistanceFromUser}
            />
          )}

          {activeTab === 'mountains' && (
            <MountainsTabPanel
              mountains={mountains}
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              showSave={showSave}
              isSaved={isSaved}
              onToggleSave={onToggleSave}
              onMountainClick={onMountainClick}
            />
          )}

          {activeTab === 'campsites' && (
            <CampsitesTabPanel
              campsites={campsites}
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              showSave={showSave}
              isSaved={isSaved}
              onToggleSave={onToggleSave}
              onCampsiteClick={onCampsiteClick}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTabPanel
              activities={activities}
              searchQuery={searchQuery}
              stravaSyncState={stravaSyncState}
              onActivityClick={onActivityClick}
              onConnectDevices={onConnectDevices}
            />
          )}

          {activeTab === 'saved' && (
            <SavedTabPanel
              savedPlaces={savedPlaces}
              searchQuery={searchQuery}
              isAuthed={showSave}
              routes={routes}
              mountains={mountains}
              campsites={campsites}
              onRouteClick={onRouteClick}
              onMountainClick={onMountainClick}
              onCampsiteClick={onCampsiteClick}
              onToggleSave={onToggleSave}
            />
          )}
        </div>
      )}
    </div>
  );
}
