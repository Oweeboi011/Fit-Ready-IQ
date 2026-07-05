'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import {
  X,
  TrendingUp,
  Flame,
  Clock,
  Mountain,
  Route,
  Activity as ActivityIcon,
  Zap,
} from 'lucide-react';
import { type Activity, formatDuration, SOURCE_LABELS, SOURCE_BG } from '@/lib/activityTypes';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
  } | null;
  activities: Activity[];
  onSignOut: () => void;
}

/** Compute a 0–100 fitness score from activity history. */
function computeFitnessScore(activities: Activity[]): {
  score: number;
  label: string;
  color: string;
  breakdown: { label: string; value: number; max: number; color: string }[];
} {
  if (activities.length === 0) {
    return { score: 0, label: 'No Data', color: '#475569', breakdown: [] };
  }

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recent = activities.filter((a) => new Date(a.start_date).getTime() >= thirtyDaysAgo);

  if (recent.length === 0) {
    return {
      score: 0,
      label: 'Inactive',
      color: '#ef4444',
      breakdown: [
        { label: 'Volume', value: 0, max: 25, color: '#3b82f6' },
        { label: 'Frequency', value: 0, max: 25, color: '#8b5cf6' },
        { label: 'Elevation', value: 0, max: 25, color: '#22c55e' },
        { label: 'Consistency', value: 0, max: 25, color: '#f59e0b' },
      ],
    };
  }

  // Volume (0–25): 100 km/month = full score — achievable for active recreational athletes
  const recentKm = recent.reduce((s, a) => s + a.distance_km, 0);
  const volumeScore = Math.min(25, (recentKm / 100) * 25);

  // Frequency (0–25): 12 activities/month = full score — 3×/week is a solid training cadence
  const freqScore = Math.min(25, (recent.length / 12) * 25);

  // Elevation (0–25): 2,500 m/month = full score — meaningful for trail runners and cyclists
  const recentElev = recent.reduce((s, a) => s + a.elevation_gain_m, 0);
  const elevScore = Math.min(25, (recentElev / 2500) * 25);

  // Consistency (0–20): active weeks out of last 4 — highest weight, most indicative of habit
  const weekBuckets = new Set(
    recent.map((a) => {
      const msAgo = now - new Date(a.start_date).getTime();
      return Math.floor(msAgo / (7 * 24 * 60 * 60 * 1000));
    })
  );
  const consistencyScore = Math.min(20, (weekBuckets.size / 4) * 20);

  // Intensity bonus (0–5): if heart rate data is present, reward effort
  const hrActivities = recent.filter((a) => (a.avg_heartrate ?? 0) > 0);
  let intensityBonus = 0;
  if (hrActivities.length > 0) {
    const avgHR =
      hrActivities.reduce((s, a) => s + (a.avg_heartrate ?? 0), 0) / hrActivities.length;
    // Zone 2 baseline ~130 bpm. Reward anything consistently above 130.
    intensityBonus = Math.min(5, Math.max(0, ((avgHR - 110) / 40) * 5));
  }

  const total = Math.min(
    100,
    Math.round(volumeScore + freqScore + elevScore + consistencyScore + intensityBonus)
  );

  const label =
    total >= 80
      ? 'Elite'
      : total >= 60
        ? 'Advanced'
        : total >= 40
          ? 'Intermediate'
          : total >= 20
            ? 'Beginner'
            : 'Getting Started';

  const color =
    total >= 80
      ? '#22c55e'
      : total >= 60
        ? '#84cc16'
        : total >= 40
          ? '#eab308'
          : total >= 20
            ? '#f97316'
            : '#ef4444';

  return {
    score: total,
    label,
    color,
    breakdown: [
      { label: 'Volume', value: Math.round(volumeScore), max: 25, color: '#3b82f6' },
      { label: 'Frequency', value: Math.round(freqScore), max: 25, color: '#8b5cf6' },
      { label: 'Elevation', value: Math.round(elevScore), max: 25, color: '#22c55e' },
      { label: 'Consistency', value: Math.round(consistencyScore), max: 20, color: '#f59e0b' },
    ],
  };
}

export default function ProfileModal({
  isOpen,
  onClose,
  user,
  activities,
  onSignOut,
}: ProfileModalProps) {
  const fitness = useMemo(() => computeFitnessScore(activities), [activities]);

  const stats = useMemo(() => {
    const totalKm = activities.reduce((s, a) => s + a.distance_km, 0);
    const totalElev = activities.reduce((s, a) => s + a.elevation_gain_m, 0);
    const totalTime = activities.reduce((s, a) => s + a.moving_time_s, 0);
    const avgHR =
      activities.filter((a) => a.avg_heartrate).length > 0
        ? Math.round(
            activities
              .filter((a) => a.avg_heartrate)
              .reduce((s, a) => s + (a.avg_heartrate ?? 0), 0) /
              activities.filter((a) => a.avg_heartrate).length
          )
        : null;

    const byType: Record<string, number> = {};
    for (const a of activities) {
      byType[a.sport_type] = (byType[a.sport_type] ?? 0) + 1;
    }
    const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return { totalKm, totalElev, totalTime, avgHR, topType, count: activities.length };
  }, [activities]);

  const monthlyByType = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const thisMonth = activities.filter((a) => new Date(a.start_date).getTime() >= monthStart);

    const tally = (keywords: string[]) => {
      const matches = thisMonth.filter((a) =>
        keywords.some((k) => a.sport_type.toLowerCase().includes(k))
      );
      return {
        count: matches.length,
        km: matches.reduce((s, a) => s + a.distance_km, 0),
        elev: matches.reduce((s, a) => s + a.elevation_gain_m, 0),
      };
    };

    return {
      run: tally(['run']),
      ride: tally(['ride', 'cycling', 'cycle']),
      walk: tally(['walk', 'hike']),
      total: thisMonth.length,
    };
  }, [activities]);

  const recent = useMemo(
    () =>
      [...activities]
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
        .slice(0, 5),
    [activities]
  );

  if (!isOpen) return null;

  const circumference = 2 * Math.PI * 36; // r=36
  const dashOffset = circumference * (1 - fitness.score / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-slate-900 shadow-2xl sm:max-w-xl sm:rounded-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-white/[0.06] bg-slate-900/95 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-bold text-white">My Profile</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* User info */}
          <div className="flex items-center gap-4">
            {user?.photoURL ? (
              <Image
                src={user.photoURL}
                alt="Profile"
                width={56}
                height={56}
                className="h-14 w-14 rounded-full border-2 border-white/20"
                unoptimized
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xl font-bold text-white">
                {user?.displayName?.charAt(0) ?? '?'}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-white">
                {user?.displayName ?? 'Anonymous'}
              </p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
              <p className="mt-1 text-xs text-slate-400">{stats.count} activities synced</p>
            </div>
            <button
              onClick={onSignOut}
              className="ml-auto flex-shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </div>

          {/* Fitness Score */}
          <div className="rounded-xl border border-white/[0.06] bg-slate-800/60 p-4">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Fitness Score
            </h3>
            <div className="flex items-center gap-6">
              {/* Circular gauge */}
              <div className="relative flex-shrink-0">
                <svg width="90" height="90" viewBox="0 0 90 90">
                  <circle cx="45" cy="45" r="36" fill="none" stroke="#1e293b" strokeWidth="8" />
                  <circle
                    cx="45"
                    cy="45"
                    r="36"
                    fill="none"
                    stroke={fitness.color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 45 45)"
                    style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold leading-none text-white">
                    {fitness.score}
                  </span>
                  <span className="text-[10px] text-slate-400">/100</span>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="flex-1 space-y-2">
                <p className="text-sm font-bold" style={{ color: fitness.color }}>
                  {fitness.label}
                </p>
                {fitness.breakdown.map(({ label, value, max, color }) => (
                  <div key={label}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">{label}</span>
                      <span className="text-[11px] font-semibold text-slate-300">
                        {value}/{max}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-[10px] text-slate-400">Based on last 30 days of activity</p>
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: 'Total Distance',
                value: `${stats.totalKm.toFixed(0)} km`,
                icon: Route,
                color: 'text-blue-400',
              },
              {
                label: 'Elevation',
                value: `${stats.totalElev.toLocaleString()} m`,
                icon: Mountain,
                color: 'text-green-400',
              },
              {
                label: 'Moving Time',
                value: formatDuration(stats.totalTime),
                icon: Clock,
                color: 'text-purple-400',
              },
              {
                label: 'Avg HR',
                value: stats.avgHR ? `${stats.avgHR} bpm` : '—',
                icon: Flame,
                color: 'text-red-400',
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="rounded-xl border border-white/[0.06] bg-slate-800/60 p-3"
              >
                <Icon className={`h-4 w-4 ${color} mb-2`} />
                <p className="text-[10px] text-slate-400">{label}</p>
                <p className="mt-0.5 text-base font-bold leading-tight text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* This Month */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              This Month
              <span className="ml-2 font-normal normal-case text-slate-500">
                {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    key: 'run',
                    label: 'Run',
                    color: 'text-orange-400',
                    border: 'border-orange-500/20',
                    bg: 'bg-orange-500/10',
                  },
                  {
                    key: 'ride',
                    label: 'Ride',
                    color: 'text-sky-400',
                    border: 'border-sky-500/20',
                    bg: 'bg-sky-500/10',
                  },
                  {
                    key: 'walk',
                    label: 'Walk / Hike',
                    color: 'text-emerald-400',
                    border: 'border-emerald-500/20',
                    bg: 'bg-emerald-500/10',
                  },
                ] as const
              ).map(({ key, label, color, border, bg }) => {
                const d = monthlyByType[key];
                return (
                  <div key={key} className={`rounded-xl border ${border} ${bg} p-3`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${color}`}>
                      {label}
                    </p>
                    <p className="mt-1.5 text-lg font-bold leading-none text-white">
                      {d.km.toFixed(1)}
                      <span className="ml-0.5 text-xs font-normal text-slate-400">km</span>
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {d.count} {d.count === 1 ? 'activity' : 'activities'}
                    </p>
                    {d.elev > 0 && (
                      <p className="text-[10px] text-slate-500">+{d.elev.toLocaleString()} m</p>
                    )}
                  </div>
                );
              })}
            </div>
            {monthlyByType.total === 0 && (
              <p className="mt-2 text-center text-xs text-slate-500">
                No activities recorded this month yet
              </p>
            )}
          </div>

          {/* Extra insights */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-slate-800/60 p-3 text-center">
              <ActivityIcon className="mx-auto mb-1 h-4 w-4 text-slate-400" />
              <p className="text-[10px] text-slate-400">Activities</p>
              <p className="text-lg font-bold text-white">{stats.count}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-slate-800/60 p-3 text-center">
              <TrendingUp className="mx-auto mb-1 h-4 w-4 text-slate-400" />
              <p className="text-[10px] text-slate-400">Top Sport</p>
              <p className="text-sm font-bold capitalize text-white">{stats.topType ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-slate-800/60 p-3 text-center">
              <Zap className="mx-auto mb-1 h-4 w-4 text-slate-400" />
              <p className="text-[10px] text-slate-400">Avg Dist</p>
              <p className="text-sm font-bold text-white">
                {stats.count > 0 ? `${(stats.totalKm / stats.count).toFixed(1)} km` : '—'}
              </p>
            </div>
          </div>

          {/* Recent activities */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Recent Activities
            </h3>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-slate-800/30 py-8 text-center">
                <ActivityIcon className="mb-2 h-6 w-6 text-slate-500" />
                <p className="text-sm text-slate-400">No activities yet</p>
                <p className="mt-1 text-xs text-slate-500">Connect Strava or upload a GPX file</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-slate-800/60 px-4 py-3"
                  >
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${SOURCE_BG[a.source]}`}
                    >
                      <ActivityIcon className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{a.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(a.start_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                        {' · '}
                        {SOURCE_LABELS[a.source]}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-semibold text-white">
                        {a.distance_km.toFixed(1)} km
                      </p>
                      <p className="text-[11px] text-slate-400">+{a.elevation_gain_m} m</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
