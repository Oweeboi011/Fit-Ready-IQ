import { TrendingUp } from 'lucide-react';
import type { Activity } from '@/lib/activityTypes';

const SOURCE_BADGE: Record<string, string> = {
  strava: 'bg-orange-500/15 text-orange-300',
  coros: 'bg-blue-500/15 text-blue-300',
  garmin: 'bg-sky-500/15 text-sky-300',
  komoot: 'bg-green-500/15 text-green-300',
};

const SOURCE_LABEL: Record<string, string> = {
  strava: 'Strava',
  coros: 'COROS',
  garmin: 'Garmin',
  komoot: 'Komoot',
};

interface ActivityListItemProps {
  activity: Activity;
  onClick: () => void;
}

export default function ActivityListItem({ activity, onClick }: ActivityListItemProps) {
  const h = Math.floor(activity.moving_time_s / 3600);
  const m = Math.floor((activity.moving_time_s % 3600) / 60);
  const duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-lg border border-white/[0.07] bg-white/5 px-3.5 py-3 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-900/10"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-[13px] font-semibold text-slate-200 group-hover:text-violet-300">
          {activity.name}
        </p>
        <span
          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_BADGE[activity.source] ?? 'bg-slate-700 text-slate-300'}`}
        >
          {SOURCE_LABEL[activity.source] ?? activity.source}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] capitalize text-slate-500">
        {activity.sport_type} · {new Date(activity.start_date).toLocaleDateString()}
      </p>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
        <span>{activity.distance_km.toFixed(1)} km</span>
        <span className="flex items-center gap-0.5">
          <TrendingUp aria-hidden="true" className="h-3 w-3" /> {activity.elevation_gain_m} m
        </span>
        <span>{duration}</span>
      </div>
    </button>
  );
}
