import { Tent } from 'lucide-react';
import CampsiteListItem from '@/components/CampsiteListItem';
import type { Campsite } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import { buttonSecondary, buttonSize } from '@/lib/ui';

interface CampsitesTabPanelProps {
  campsites: Campsite[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  showSave: boolean;
  isSaved: (id: string) => boolean;
  onToggleSave: (place: Omit<SavedPlace, 'savedAt'>) => void;
  onCampsiteClick: (campsite: Campsite) => void;
}

export default function CampsitesTabPanel({
  campsites,
  searchQuery,
  onSearchQueryChange,
  showSave,
  isSaved,
  onToggleSave,
  onCampsiteClick,
}: CampsitesTabPanelProps) {
  const list = campsites.filter(
    (c) => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
        <Tent aria-hidden="true" className="h-6 w-6 text-slate-600" />
        <p className="text-xs font-medium text-slate-400">
          {searchQuery ? `No campsites match “${searchQuery}”` : 'No campsites found near here'}
        </p>
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchQueryChange('')}
            className={`${buttonSecondary} ${buttonSize.sm} mt-1`}
          >
            Clear search
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {list.map((campsite, idx) => (
        <CampsiteListItem
          key={campsite.id}
          campsite={campsite}
          index={idx}
          showSave={showSave}
          isSaved={isSaved(campsite.id)}
          onToggleSave={() =>
            onToggleSave({
              id: campsite.id,
              type: 'campsite',
              name: campsite.name,
              coordinates: campsite.coordinates,
              rating: campsite.rating,
              photos: campsite.photos,
              place_id: campsite.place_id,
            })
          }
          onClick={() => onCampsiteClick(campsite)}
        />
      ))}
    </>
  );
}
