import { Clock } from 'lucide-react';
import ActivityListItem from '@/components/ActivityListItem';
import type { Activity } from '@/lib/activityTypes';
import { buttonSecondary, buttonSize } from '@/lib/ui';

interface HistoryTabPanelProps {
  activities: Activity[];
  searchQuery: string;
  stravaSyncState: 'idle' | 'syncing' | 'synced' | 'failed';
  onActivityClick: (activity: Activity) => void;
  onConnectDevices: () => void;
}

export default function HistoryTabPanel({
  activities,
  searchQuery,
  stravaSyncState,
  onActivityClick,
  onConnectDevices,
}: HistoryTabPanelProps) {
  const list = activities.filter(
    (a) => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {stravaSyncState !== 'idle' && (
        <div
          role="status"
          className={`mb-1.5 flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
            stravaSyncState === 'syncing'
              ? 'border-white/10 bg-white/5'
              : 'border-amber-500/20 bg-amber-500/10'
          }`}
        >
          {stravaSyncState === 'syncing' ? (
            <>
              <span className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500" />
              <p className="text-[11px] text-slate-300">Syncing your Strava activities…</p>
            </>
          ) : (
            <p className="flex-1 text-[11px] text-amber-100">
              We couldn&apos;t finish syncing Strava. Some activities may be missing.
            </p>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
          <Clock aria-hidden="true" className="mx-auto h-5 w-5 text-slate-500" />
          <p className="mt-2 text-xs text-slate-400">No activities yet</p>
          <p className="mt-1 text-[10px] text-slate-500">Connect Strava or import GPX files</p>
          <button onClick={onConnectDevices} className={`${buttonSecondary} ${buttonSize.sm} mt-3`}>
            Connect Devices
          </button>
        </div>
      ) : (
        list.map((activity) => (
          <ActivityListItem
            key={activity.id}
            activity={activity}
            onClick={() => onActivityClick(activity)}
          />
        ))
      )}
    </>
  );
}
