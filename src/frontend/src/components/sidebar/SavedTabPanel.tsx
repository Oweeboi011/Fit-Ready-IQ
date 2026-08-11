import { Bookmark } from 'lucide-react';
import SavedPlaceListItem from '@/components/SavedPlaceListItem';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';

interface SavedTabPanelProps {
  savedPlaces: SavedPlace[];
  searchQuery: string;
  isAuthed: boolean;
  routes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  onRouteClick: (route: RouteData) => void;
  onMountainClick: (mountain: MountainData) => void;
  onCampsiteClick: (campsite: Campsite) => void;
  onToggleSave: (place: Omit<SavedPlace, 'savedAt'>) => void;
}

export default function SavedTabPanel({
  savedPlaces,
  searchQuery,
  isAuthed,
  routes,
  mountains,
  campsites,
  onRouteClick,
  onMountainClick,
  onCampsiteClick,
  onToggleSave,
}: SavedTabPanelProps) {
  const list = savedPlaces.filter(
    (p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAuthed) return null;

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
        <Bookmark aria-hidden="true" className="h-6 w-6 text-slate-600" />
        <p className="text-xs font-medium text-slate-500">No saved places yet</p>
        <p className="text-[10px] text-slate-600">
          Tap the bookmark icon on any route, peak, or campsite
        </p>
      </div>
    );
  }

  return (
    <>
      {list.map((place, idx) => (
        <SavedPlaceListItem
          key={place.id}
          place={place}
          index={idx}
          onClick={() => {
            if (place.type === 'route') {
              const r = routes.find((x) => x.id === place.id);
              if (r) onRouteClick(r);
            } else if (place.type === 'mountain') {
              const m = mountains.find((x) => x.id === place.id);
              if (m) onMountainClick(m);
            } else {
              const c = campsites.find((x) => x.id === place.id);
              if (c) onCampsiteClick(c);
            }
          }}
          onUnsave={() => onToggleSave(place)}
        />
      ))}
    </>
  );
}
