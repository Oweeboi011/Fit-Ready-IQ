import type { RefObject } from 'react';
import { type User as FirebaseUser } from 'firebase/auth';
import type { FilterState } from '@/components/RouteFilter';
import LocationNotice from '@/components/sidebar/LocationNotice';
import CurrentLocationButton from '@/components/sidebar/CurrentLocationButton';
import SidebarSearchBox from '@/components/sidebar/SidebarSearchBox';
import SidebarTabs, { type TabId } from '@/components/sidebar/SidebarTabs';
import SidebarTabPanels from '@/components/sidebar/SidebarTabPanels';
import { computeReadiness } from '@/lib/readiness';
import type { Activity } from '@/lib/activityTypes';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import type { CollectionName } from '@/lib/usePlacesData';
import type { LocationProblem, LocationSource, UserLocation } from '@/lib/useUserLocation';

export type { TabId } from '@/components/sidebar/SidebarTabs';

interface PlacesSidebarProps {
  sidebarOpen: boolean;
  locationProblem: LocationProblem | null;
  locationNoticeDismissed: boolean;
  onDismissLocationNotice: () => void;
  locationSource: LocationSource | null;
  onRetryLocation: () => void;
  searchInputRef: RefObject<HTMLInputElement>;
  userLocation: UserLocation | null;
  hasPreciseLocation: boolean;
  isLocating: boolean;
  onFocusUserLocation: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onTabKeyDown: (event: React.KeyboardEvent, tabId: TabId) => void;
  authUser: FirebaseUser | null;
  filteredRoutes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  routes: RouteData[];
  savedPlaces: SavedPlace[];
  activities: Activity[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  isLoading: boolean;
  error: string | null;
  onRetryPlaces: () => void;
  elevationUnavailable: boolean;
  failedCollections: CollectionName[];
  collectionLabels: Record<CollectionName, string>;
  isSaved: (id: string) => boolean;
  onToggleSave: (place: Omit<SavedPlace, 'savedAt'>) => void;
  onRouteClick: (route: RouteData) => void;
  onMountainClick: (mountain: MountainData) => void;
  onCampsiteClick: (campsite: Campsite) => void;
  onActivityClick: (activity: Activity) => void;
  readinessByRoute: Record<string, ReturnType<typeof computeReadiness>>;
  stravaSyncState: 'idle' | 'syncing' | 'synced' | 'failed';
  onConnectDevices: () => void;
}

export default function PlacesSidebar({
  sidebarOpen,
  locationProblem,
  locationNoticeDismissed,
  onDismissLocationNotice,
  locationSource,
  onRetryLocation,
  searchInputRef,
  userLocation,
  hasPreciseLocation,
  isLocating,
  onFocusUserLocation,
  searchQuery,
  onSearchQueryChange,
  activeTab,
  onSelectTab,
  onTabKeyDown,
  authUser,
  filteredRoutes,
  mountains,
  campsites,
  routes,
  savedPlaces,
  activities,
  filters,
  onFiltersChange,
  isLoading,
  error,
  onRetryPlaces,
  elevationUnavailable,
  failedCollections,
  collectionLabels,
  isSaved,
  onToggleSave,
  onRouteClick,
  onMountainClick,
  onCampsiteClick,
  onActivityClick,
  readinessByRoute,
  stravaSyncState,
  onConnectDevices,
}: PlacesSidebarProps) {
  return (
    <aside
      className={`sidebar-scroll bg-slate-900/98 fixed inset-y-0 left-0 z-30 flex w-[min(320px,85vw)] flex-col gap-2.5 overflow-y-auto border-r border-ink/[0.06] p-3 backdrop-blur-xl transition-transform duration-300 ease-out md:relative md:inset-auto md:z-auto md:w-80 md:flex-shrink-0 ${sidebarOpen ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full md:translate-x-0'}`}
    >
      {locationProblem && !locationNoticeDismissed && (
        <LocationNotice
          problem={locationProblem}
          source={locationSource}
          onDismiss={onDismissLocationNotice}
          onRetry={onRetryLocation}
          onSearchInstead={() => searchInputRef.current?.focus()}
        />
      )}

      {userLocation && (
        <CurrentLocationButton
          userLocation={userLocation}
          hasPreciseLocation={hasPreciseLocation}
          isLocating={isLocating}
          onFocus={onFocusUserLocation}
        />
      )}

      <SidebarSearchBox
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />

      <SidebarTabs
        isAuthed={Boolean(authUser)}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onTabKeyDown={onTabKeyDown}
        searchQuery={searchQuery}
        filteredRoutes={filteredRoutes}
        mountains={mountains}
        campsites={campsites}
        savedPlaces={savedPlaces}
        activities={activities}
      />

      <SidebarTabPanels
        activeTab={activeTab}
        isLoading={isLoading}
        error={error}
        onRetryPlaces={onRetryPlaces}
        elevationUnavailable={elevationUnavailable}
        failedCollections={failedCollections}
        collectionLabels={collectionLabels}
        filteredRoutes={filteredRoutes}
        mountains={mountains}
        campsites={campsites}
        routes={routes}
        savedPlaces={savedPlaces}
        activities={activities}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        filters={filters}
        onFiltersChange={onFiltersChange}
        showSave={Boolean(authUser)}
        isSaved={isSaved}
        onToggleSave={onToggleSave}
        onRouteClick={onRouteClick}
        onMountainClick={onMountainClick}
        onCampsiteClick={onCampsiteClick}
        onActivityClick={onActivityClick}
        readinessByRoute={readinessByRoute}
        showDistanceFromUser={locationSource !== 'fallback'}
        stravaSyncState={stravaSyncState}
        onConnectDevices={onConnectDevices}
      />
    </aside>
  );
}
