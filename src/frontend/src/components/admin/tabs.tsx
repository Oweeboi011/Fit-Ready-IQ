'use client';

import { CheckCircle, TriangleAlert } from 'lucide-react';

import { authedFetch } from '@/lib/firebaseClient';
import { buttonGhost, buttonSize } from '@/lib/ui';

import type { AdminData } from './types';

/** Services the health endpoint reports on, in the order an operator reads them. */
const SERVICE_ROWS: { key: string; label: string }[] = [
  { key: 'firebase_client', label: 'Firebase Auth' },
  { key: 'firebase_admin', label: 'Firebase Admin' },
  { key: 'maps', label: 'Google Maps' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'weather', label: 'Weather' },
  { key: 'strava', label: 'Strava' },
];

/** Grid cell size used by the places cache, from the API route. */
const GRID_DEGREES = 0.5;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-slate-800/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="font-tabular mt-1.5 text-xl font-bold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Unavailable({ what, why }: { what: string; why: string }) {
  return (
    <div className="rounded-xl border border-dashed border-ink/10 bg-slate-900/40 p-6 text-center">
      <p className="text-sm font-semibold text-slate-200">{what}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">{why}</p>
    </div>
  );
}

export function ActivityTab({ data }: { data: AdminData }) {
  const sync = data.stravaSync;
  if (!sync) {
    return (
      <Unavailable
        what="Activity data unavailable"
        why="The admin sync endpoint did not respond. This usually means you are not signed in with an allowlisted account, or Firebase Admin credentials are missing."
      />
    );
  }

  const withErrors = sync.entries.filter((e) => e.errors && e.errors.length > 0).length;
  const totalActivities = sync.entries.reduce((s, e) => s + e.total_activities, 0);
  const synced = sync.entries.filter((e) => e.last_synced_at).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Connected users" value={String(sync.total)} />
        <Stat label="Synced" value={String(synced)} hint="have run at least once" />
        <Stat label="Activities" value={totalActivities.toLocaleString()} />
        <Stat
          label="With errors"
          value={String(withErrors)}
          hint={withErrors > 0 ? 'needs attention' : 'all clean'}
        />
      </div>

      {sync.entries.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-ink/[0.06]">
          <table className="w-full text-left">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  User
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Activities
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Last sync
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.04]">
              {sync.entries.slice(0, 8).map((entry) => (
                <tr key={entry.uid}>
                  <td className="max-w-[10rem] truncate px-3 py-2 font-mono text-[10px] text-slate-400">
                    {entry.uid}
                  </td>
                  <td className="font-tabular px-3 py-2 text-xs text-slate-200">
                    {entry.total_activities}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-400">
                    {entry.last_synced_at
                      ? new Date(entry.last_synced_at).toLocaleString()
                      : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CostTab({ data }: { data: AdminData }) {
  const cache = data.cache;

  return (
    <div className="space-y-4">
      <Unavailable
        what="Spend is not connected"
        why="Actual cost lives in Google Cloud Billing, Firebase and Vercel. This panel will not print a dollar figure it cannot verify — an invented total is worse than none, because it gets acted on."
      />

      {cache && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            What we can measure
          </h3>
          {/* Cache reuse is the one cost lever the app actually controls, and
              it is countable without a billing integration. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Cached regions"
              value={String(cache.total)}
              hint={`${GRID_DEGREES}° grid cells`}
            />
            <Stat
              label="Serving from cache"
              value={String(cache.fresh)}
              hint="no live Places calls"
            />
            <Stat
              label="Will refetch"
              value={String(cache.stale)}
              hint="stale, next visit is live"
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Each fresh region serves its visitors without touching the Places, Elevation or Distance
            Matrix APIs. Raising the fresh share is the most direct cost reduction available.
          </p>
        </div>
      )}
    </div>
  );
}

export function GovernanceTab({ data }: { data: AdminData }) {
  const health = data.health;
  if (!health) {
    return (
      <Unavailable
        what="Configuration unavailable"
        why="The health endpoint did not respond, so credential presence cannot be confirmed."
      />
    );
  }

  const rows = SERVICE_ROWS.map(({ key, label }) => ({
    label,
    detail: health[key]?.message ?? 'Not reported',
    ok: Boolean(health[key]?.ok),
  }));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {rows.map(({ label, detail, ok }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-lg border border-ink/[0.05] bg-slate-800/40 px-3 py-2.5"
          >
            {ok ? (
              <CheckCircle aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-emerald-400" />
            ) : (
              <TriangleAlert aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-amber-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200">{label}</p>
              <p className="truncate text-[10px] text-slate-500">{detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-ink/[0.06] bg-slate-800/40 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Access control
        </h3>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-400">
          <li>
            Admin routes verify a Firebase ID token server-side and check the email against{' '}
            <code className="text-slate-300">ADMIN_EMAILS</code>. An empty list denies everyone —
            the gate fails closed.
          </li>
          <li>
            The allowlist is never sent to the browser. Client-side hiding is presentation only;
            every admin route re-verifies.
          </li>
          <li>Activity files are parsed on-device. GPX uploads are never sent to a server.</li>
        </ul>
      </div>
    </div>
  );
}

export function CachingTab({ data, onRefresh }: { data: AdminData; onRefresh: () => void }) {
  const cache = data.cache;
  if (!cache) {
    return (
      <Unavailable
        what="Cache unavailable"
        why="The admin cache endpoint did not respond. Check that you are signed in with an allowlisted account."
      />
    );
  }

  const freshShare = cache.total === 0 ? 0 : Math.round((cache.fresh / cache.total) * 100);

  async function purgeAll() {
    if (
      !confirm(
        'Purge ALL cache entries? The next user in each region will trigger a full live fetch.'
      )
    ) {
      return;
    }
    try {
      await authedFetch('/api/admin/cache', { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      console.error('Purge failed:', err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Regions" value={String(cache.total)} />
        <Stat label="Fresh" value={String(cache.fresh)} hint="< 24 h old" />
        <Stat label="Stale" value={String(cache.stale)} />
      </div>

      <div className="rounded-xl border border-ink/[0.06] bg-slate-800/40 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-medium text-slate-300">Fresh share</p>
          <p className="font-tabular text-xs font-bold text-white">{freshShare}%</p>
        </div>
        <div
          role="img"
          aria-label={`${freshShare} per cent of cached regions are fresh`}
          className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
        >
          <div
            className={`h-full rounded-full ${freshShare >= 70 ? 'bg-emerald-500' : freshShare >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${freshShare}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={purgeAll}
        className={`${buttonGhost} ${buttonSize.sm} text-red-400 hover:bg-red-500/15 hover:text-red-300`}
      >
        Purge all cache entries
      </button>
    </div>
  );
}

export function EfficiencyTab({ data }: { data: AdminData }) {
  const cache = data.cache;

  return (
    <div className="space-y-4">
      {cache ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Regions served" value={String(cache.total)} hint="from one shared cache" />
          <Stat
            label="Avg age"
            value={
              cache.entries.length === 0
                ? '—'
                : `${Math.round(
                    cache.entries.reduce((s, e) => s + e.ageHours, 0) / cache.entries.length
                  )} h`
            }
          />
          <Stat
            label="Places per region"
            value={
              cache.entries.length === 0
                ? '—'
                : String(
                    Math.round(
                      cache.entries.reduce(
                        (s, e) => s + e.routeCount + e.mountainCount + e.campsiteCount,
                        0
                      ) / cache.entries.length
                    )
                  )
            }
          />
        </div>
      ) : (
        <Unavailable
          what="Efficiency data unavailable"
          why="These figures are derived from the places cache, which did not respond."
        />
      )}

      <div className="rounded-xl border border-ink/[0.06] bg-slate-800/40 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Request budget
        </h3>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-400">
          <li>
            A cold region costs roughly 40 Places text searches, 4 nearby searches, plus Elevation
            and Distance Matrix batches.
          </li>
          <li>
            Three cache tiers absorb repeats: sessionStorage per tab (30 min), Firestore shared
            across users in a {GRID_DEGREES}° cell (24 h), then live.
          </li>
          <li>
            Client-side weather and photo caches hold for 30 minutes and the session respectively.
          </li>
        </ul>
        <p className="mt-3 text-[10px] text-slate-500">
          Per-request counts are not instrumented. Wire a metrics sink to turn these from
          descriptions into measurements.
        </p>
      </div>
    </div>
  );
}
