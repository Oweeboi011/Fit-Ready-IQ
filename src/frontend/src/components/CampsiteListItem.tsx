import { Tent, Bookmark } from 'lucide-react';
import { WeatherAlertBadgeNear } from '@/components/WeatherAlertBadge';
import type { Campsite } from '@/lib/placesTypes';

interface CampsiteListItemProps {
  campsite: Campsite;
  index: number;
  showSave: boolean;
  isSaved: boolean;
  onToggleSave: () => void;
  onClick: () => void;
}

export default function CampsiteListItem({
  campsite,
  index,
  showSave,
  isSaved,
  onToggleSave,
  onClick,
}: CampsiteListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-enter group w-full rounded-xl border border-white/[0.07] bg-white/5 px-3.5 py-3 text-left transition-all hover:border-emerald-500/30 hover:bg-emerald-500/[0.07] active:scale-[0.99]"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-emerald-300">
          {campsite.name}
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
              aria-label={isSaved ? 'Unsave campsite' : 'Save campsite'}
            >
              <Bookmark
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${isSaved ? 'fill-amber-400 text-amber-400' : ''}`}
              />
            </button>
          )}
          <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/15">
            <Tent aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" />
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/20">
          {campsite.type}
        </span>
        {campsite.rating && (
          <span className="font-tabular text-[10px] text-amber-400">
            * {campsite.rating.toFixed(1)}
          </span>
        )}
        <WeatherAlertBadgeNear lat={campsite.coordinates[1]} lng={campsite.coordinates[0]} />
      </div>
    </button>
  );
}
