'use client';

import { CalendarClock, CloudOff, ShieldAlert, Sun } from 'lucide-react';

import type { WeatherWindow, WeatherWindowStatus } from '@/lib/weatherWindow';

/**
 * When to go, rendered.
 *
 * The forecast already told the user what the weather is. This is the only part
 * of it that answers a decision — ADR-0004's point that current conditions at a
 * summit you are not standing on cannot tell you when to set out.
 *
 * Times are formatted here rather than in `weatherWindow.ts` so the computation
 * stays pure and timezone-free; the browser's locale is the right authority for
 * how a local start time should read.
 */

const STATUS_META: Record<
  WeatherWindowStatus,
  { label: string; tone: string; ring: string; Icon: typeof Sun }
> = {
  clear: {
    label: 'Good window',
    tone: 'text-emerald-300',
    ring: 'border-emerald-500/25 bg-emerald-500/[0.07]',
    Icon: Sun,
  },
  marginal: {
    label: 'Passable window',
    tone: 'text-amber-300',
    ring: 'border-amber-500/25 bg-amber-500/[0.07]',
    Icon: CalendarClock,
  },
  none: {
    label: 'No safe window',
    tone: 'text-rose-300',
    ring: 'border-rose-500/25 bg-rose-500/[0.07]',
    Icon: ShieldAlert,
  },
  unknown: {
    label: 'Window unknown',
    tone: 'text-slate-400',
    ring: 'border-ink/10 bg-ink/[0.03]',
    Icon: CloudOff,
  },
};

/** "Sat 06:00" in the reader's own locale and zone. */
function formatHour(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Span({ start, end }: { start: string; end: string }) {
  const from = formatHour(start);
  const to = formatHour(end);
  // A malformed timestamp drops the span rather than rendering "Invalid Date".
  if (!from || !to) return null;

  return (
    <p className="font-tabular mt-1 text-sm font-semibold text-white">
      {from} → {to}
    </p>
  );
}

export function WeatherWindowPanel({ window }: { window: WeatherWindow | null }) {
  const status: WeatherWindowStatus = window?.status ?? 'unknown';
  const meta = STATUS_META[status];
  const summary = window?.summary ?? 'No forecast available for this route.';

  return (
    <section aria-label="Weather window" className={`rounded-xl border px-4 py-3 ${meta.ring}`}>
      <div className="flex items-start gap-3">
        <meta.Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 flex-shrink-0 ${meta.tone}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${meta.tone}`}>
            {meta.label}
          </p>

          {window?.start && window.end && <Span start={window.start} end={window.end} />}

          <p className="mt-1 text-xs leading-relaxed text-slate-400">{summary}</p>

          {window && window.hazards.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {window.hazards.map((hazard) => (
                <li
                  key={`${hazard.kind}-${hazard.at}`}
                  className="rounded-full border border-ink/10 bg-ink/[0.04] px-2 py-0.5 text-[10px] text-slate-300"
                >
                  {hazard.summary}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default WeatherWindowPanel;
