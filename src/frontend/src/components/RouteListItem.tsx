import { Bookmark } from 'lucide-react';
import { ReadinessBadge } from '@/components/ReadinessPanel';
import { computeReadiness } from '@/lib/readiness';
import { WeatherAlertBadgeNear } from '@/components/WeatherAlertBadge';
import { DIFFICULTY_LABELS } from '@/lib/routeDifficulty';
import { formatActivityType } from '@/lib/activityTypes';
import type { Route as RouteData } from '@/lib/placesTypes';

const DIFFICULTY_STYLE: Record<string, { pill: string; dot: string; bar: string }> = {
  easy: {
    pill: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
    dot: 'bg-emerald-400',
    bar: 'bg-emerald-500',
  },
  moderate: {
    pill: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',
    dot: 'bg-amber-400',
    bar: 'bg-amber-500',
  },
  hard: {
    pill: 'bg-red-500/15 text-red-400 ring-red-500/20',
    dot: 'bg-red-400',
    bar: 'bg-red-500',
  },
};

interface RouteListItemProps {
  route: RouteData;
  index: number;
  showSave: boolean;
  isSaved: boolean;
  onToggleSave: () => void;
  onClick: () => void;
  readiness: ReturnType<typeof computeReadiness>;
  showDistanceFromUser: boolean;
}

export default function RouteListItem({
  route,
  index,
  showSave,
  isSaved,
  onToggleSave,
  onClick,
  readiness,
  showDistanceFromUser,
}: RouteListItemProps) {
  const ds = DIFFICULTY_STYLE[route.difficulty] ?? {
    pill: 'bg-ink/10 text-slate-400 ring-ink/10',
    dot: 'bg-slate-400',
    bar: 'bg-slate-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-enter group w-full rounded-xl border border-ink/[0.07] bg-ink/5 text-left transition-all hover:border-blue-500/30 hover:bg-blue-500/10 active:scale-[0.99]"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-stretch gap-0">
        {/* A 72px thumbnail that was empty on every card, because list
            results never carry photos — only the detail view fetches them.
            Replaced by a slim difficulty spine, which is the one thing that
            strip was actually communicating. */}
        <div aria-hidden="true" className={`w-1 flex-shrink-0 rounded-l-xl ${ds.bar} opacity-70`} />
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <div className="flex items-start justify-between gap-1">
            <p className="line-clamp-1 text-[13px] font-semibold text-slate-100 group-hover:text-white">
              {route.name}
            </p>
            {showSave && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave();
                }}
                className="-m-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                aria-label={isSaved ? 'Unsave route' : 'Save route'}
              >
                <Bookmark
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${isSaved ? 'fill-amber-400 text-amber-400' : ''}`}
                />
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${ds.pill}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${ds.dot}`} />
              {DIFFICULTY_LABELS[route.difficulty]}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-slate-500">
              {formatActivityType(route.activity_type)}
            </span>
            {/* Silent when there is no training data to score against, rather
                than showing a zero. */}
            <ReadinessBadge readiness={readiness} />
            <WeatherAlertBadgeNear lat={route.coordinates[1]} lng={route.coordinates[0]} />
          </div>

          {/* A labelled list rather than a pipe-separated run-on: at 320px
              the old row wrapped mid-metric, so a value could land on its
              own line with no clue what it measured. */}
          <dl className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
            <div className="flex items-baseline gap-1">
              <dt className="text-slate-500">Distance</dt>
              <dd className="font-tabular font-semibold text-slate-200">
                {route.distance_km.toFixed(1)} km
              </dd>
            </div>
            {/* Terrain relief sampled near the trailhead, not ascent along the
                trail, so it must not be labelled "gain". */}
            <div className="flex items-baseline gap-1">
              <dt className="text-slate-500">Relief</dt>
              <dd className="font-tabular font-semibold text-slate-200">
                {route.elevation_gain_m == null ? 'unknown' : `${route.elevation_gain_m} m`}
              </dd>
            </div>
            {/* "away" is only true relative to a place the user is actually
                at — never a fallback. */}
            {route.distance_from_user_km !== undefined && showDistanceFromUser && (
              <div className="flex items-baseline gap-1">
                <dt className="text-slate-500">Away</dt>
                <dd className="font-tabular font-semibold text-blue-400">
                  {route.distance_from_user_km.toFixed(1)} km
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </button>
  );
}
