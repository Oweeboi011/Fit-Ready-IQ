import { Mountain } from 'lucide-react';
import MountainListItem from '@/components/MountainListItem';
import type { Mountain as MountainData } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import { buttonSecondary, buttonSize } from '@/lib/ui';

interface MountainsTabPanelProps {
  mountains: MountainData[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  showSave: boolean;
  isSaved: (id: string) => boolean;
  onToggleSave: (place: Omit<SavedPlace, 'savedAt'>) => void;
  onMountainClick: (mountain: MountainData) => void;
}

export default function MountainsTabPanel({
  mountains,
  searchQuery,
  onSearchQueryChange,
  showSave,
  isSaved,
  onToggleSave,
  onMountainClick,
}: MountainsTabPanelProps) {
  const list = mountains.filter(
    (m) => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink/10 px-4 py-10 text-center">
        <Mountain aria-hidden="true" className="h-6 w-6 text-slate-600" />
        <p className="text-xs font-medium text-slate-400">
          {searchQuery ? `No mountains match “${searchQuery}”` : 'No mountains found near here'}
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
      {list.map((mountain, idx) => (
        <MountainListItem
          key={mountain.id}
          mountain={mountain}
          index={idx}
          showSave={showSave}
          isSaved={isSaved(mountain.id)}
          onToggleSave={() =>
            onToggleSave({
              id: mountain.id,
              type: 'mountain',
              name: mountain.name,
              coordinates: mountain.coordinates,
              elevation_m: mountain.elevation_m ?? undefined,
              prominence_m: mountain.prominence_m,
              mountain_type: mountain.mountain_type,
              photos: mountain.photos,
              place_id: mountain.place_id,
            })
          }
          onClick={() => onMountainClick(mountain)}
        />
      ))}
    </>
  );
}
