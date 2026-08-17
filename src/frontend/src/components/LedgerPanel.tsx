'use client';

import { Mountain, Route, Timer, Trophy } from 'lucide-react';

import { formatDuration } from '@/lib/activityTypes';
import type { Ledger, PersonalRecord } from '@/lib/ledger';

/**
 * The record, as opposed to the score.
 *
 * The fitness score above this resets every month, by design. Someone with four
 * years of imported history had nothing on screen that survived the 1st, which
 * is a strange thing for a product aimed at people whose whole motivation is
 * accumulation.
 *
 * Everything here is summed from Activities the user imported. There is no goal
 * line and no streak, because both would be invented — a total is a fact, a
 * target is a claim about what someone should be doing.
 */

function Stat({
  label,
  value,
  hint,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  Icon: typeof Route;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-slate-800/60 p-3">
      <Icon aria-hidden="true" className={`mb-2 h-4 w-4 ${tone}`} />
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="font-tabular mt-0.5 text-base font-bold leading-tight text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function RecordRow({
  label,
  record,
  format,
}: {
  label: string;
  record: PersonalRecord | null;
  format: (value: number) => string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[11px] text-slate-400">{label}</span>
      {record ? (
        <span className="min-w-0 text-right">
          <span className="font-tabular text-sm font-semibold text-white">
            {format(record.value)}
          </span>
          <span className="ml-2 truncate text-[11px] text-slate-500">{record.activity.name}</span>
        </span>
      ) : (
        // No activity carried this field — say so rather than showing a zero.
        <span className="text-[11px] text-slate-600">Not recorded</span>
      )}
    </div>
  );
}

export function LedgerPanel({ ledger }: { ledger: Ledger }) {
  if (ledger.lifetime.activities === 0) return null;

  const { lifetime, yearToDate, everests } = ledger;
  const sinceYear = ledger.since ? new Date(ledger.since).getFullYear() : null;

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-300">
        Your record
        {sinceYear && (
          <span className="ml-2 font-normal normal-case text-slate-500">since {sinceYear}</span>
        )}
      </h3>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          label={`Distance in ${ledger.year}`}
          value={`${Math.round(yearToDate.distanceKm).toLocaleString()} km`}
          hint={`${Math.round(lifetime.distanceKm).toLocaleString()} km all time`}
          Icon={Route}
          tone="text-blue-400"
        />
        <Stat
          label={`Climbed in ${ledger.year}`}
          value={`${Math.round(yearToDate.ascentM).toLocaleString()} m`}
          hint={
            // Only worth saying once there is a meaningful amount of it.
            everests >= 0.1
              ? `${everests.toFixed(1)}× Everest all time`
              : `${Math.round(lifetime.ascentM).toLocaleString()} m all time`
          }
          Icon={Mountain}
          tone="text-emerald-400"
        />
        <Stat
          label={`Moving in ${ledger.year}`}
          value={formatDuration(yearToDate.movingTimeS)}
          hint={`${yearToDate.activities} of ${lifetime.activities} outings`}
          Icon={Timer}
          tone="text-violet-400"
        />
      </div>

      <div className="mt-3 rounded-xl border border-ink/[0.06] bg-slate-800/40 px-3 py-2">
        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
          <Trophy aria-hidden="true" className="h-3 w-3" />
          Personal bests
        </p>
        <RecordRow
          label="Longest outing"
          record={ledger.records.longestDistance}
          format={(v) => `${v.toFixed(1)} km`}
        />
        <RecordRow
          label="Biggest climb"
          record={ledger.records.biggestAscent}
          format={(v) => `${Math.round(v).toLocaleString()} m`}
        />
        <RecordRow
          label="Longest time out"
          record={ledger.records.longestDuration}
          format={(v) => formatDuration(v)}
        />
      </div>
    </div>
  );
}

export default LedgerPanel;
