import { Mountain, Bookmark } from 'lucide-react';
import { WeatherAlertBadgeNear } from '@/components/WeatherAlertBadge';
import type { Mountain as MountainData } from '@/lib/placesTypes';

interface MountainListItemProps {
  mountain: MountainData;
  index: number;
  showSave: boolean;
  isSaved: boolean;
  onToggleSave: () => void;
  onClick: () => void;
}

export default function MountainListItem({
  mountain,
  index,
  showSave,
  isSaved,
  onToggleSave,
  onClick,
}: MountainListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-enter group w-full rounded-xl border border-ink/[0.07] bg-ink/5 px-3.5 py-3 text-left transition-all hover:border-slate-500/40 hover:bg-ink/[0.08] active:scale-[0.99]"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">
          {mountain.name}
        </p>
        <div className="flex flex-shrink-0 items-center gap-1">
          {showSave && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave();
              }}
              className="-m-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label={isSaved ? 'Unsave peak' : 'Save peak'}
            >
              <Bookmark
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${isSaved ? 'fill-amber-400 text-amber-400' : ''}`}
              />
            </button>
          )}
          <span className="flex h-5 w-5 items-center justify-center rounded bg-ink/10">
            <Mountain aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300 ring-1 ring-ink/10">
          {mountain.mountain_type}
        </span>
        {mountain.trail_class && (
          <span className="inline-flex items-center rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
            {mountain.trail_class}
          </span>
        )}
        <WeatherAlertBadgeNear lat={mountain.coordinates[1]} lng={mountain.coordinates[0]} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px]">
        <span className="font-tabular font-semibold text-slate-200">
          {mountain.elevation_m == null ? 'Elevation unknown' : `${mountain.elevation_m} m`}
        </span>
        {mountain.prominence_m ? (
          <>
            <span className="text-ink/20">·</span>
            <span className="font-tabular text-slate-400">{mountain.prominence_m} m prom</span>
          </>
        ) : null}
      </div>
    </button>
  );
}
