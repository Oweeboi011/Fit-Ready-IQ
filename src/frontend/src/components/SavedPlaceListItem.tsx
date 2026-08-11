import type { ReactNode } from 'react';
import { Mountain, Tent, Route, Bookmark } from 'lucide-react';
import type { SavedPlace } from '@/lib/useSavedPlaces';

const TYPE_ICON: Record<string, ReactNode> = {
  route: <Route aria-hidden="true" className="h-3.5 w-3.5 text-blue-400" />,
  mountain: <Mountain aria-hidden="true" className="h-3.5 w-3.5 text-slate-300" />,
  campsite: <Tent aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" />,
};

const TYPE_COLOR: Record<string, string> = {
  route: 'border-blue-500/30 hover:bg-blue-500/10',
  mountain: 'border-slate-500/30 hover:bg-white/[0.08]',
  campsite: 'border-emerald-500/30 hover:bg-emerald-500/[0.07]',
};

interface SavedPlaceListItemProps {
  place: SavedPlace;
  index: number;
  onClick: () => void;
  onUnsave: () => void;
}

export default function SavedPlaceListItem({
  place,
  index,
  onClick,
  onUnsave,
}: SavedPlaceListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card-enter group w-full rounded-xl border border-white/[0.07] bg-white/5 px-3.5 py-3 text-left transition-all active:scale-[0.99] ${TYPE_COLOR[place.type] ?? ''}`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">
          {place.name}
        </p>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUnsave();
            }}
            className="rounded p-0.5 text-amber-400 transition-colors hover:text-slate-400"
            aria-label="Unsave"
          >
            <Bookmark aria-hidden="true" className="h-3.5 w-3.5 fill-amber-400" />
          </button>
          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10">
            {TYPE_ICON[place.type]}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
        <span className="capitalize">{place.type}</span>
        {place.elevation_m ? (
          <>
            <span className="text-white/20">·</span>
            <span className="font-tabular">{place.elevation_m} m</span>
          </>
        ) : null}
        {place.distance_km ? (
          <>
            <span className="text-white/20">·</span>
            <span className="font-tabular">{place.distance_km.toFixed(1)} km</span>
          </>
        ) : null}
        {place.difficulty ? (
          <>
            <span className="text-white/20">·</span>
            <span className="capitalize">{place.difficulty}</span>
          </>
        ) : null}
      </div>
    </button>
  );
}
