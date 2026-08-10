'use client';

import { Activity as ActivityIcon, CalendarRange, Gauge } from 'lucide-react';
import { useState } from 'react';

import { READINESS_COLORS, type Readiness } from '@/lib/readiness';
import { buildTrainingPlan } from '@/lib/trainingPlan';
import { buttonGhost, buttonSecondary, buttonSize } from '@/lib/ui';

/** Compact score for a list row. Renders nothing when we cannot answer. */
export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  if (readiness.score == null) return null;

  const color = READINESS_COLORS[readiness.level];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: `${color}22`, color }}
      title={readiness.summary}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {readiness.score}
    </span>
  );
}

/**
 * The readiness answer, in full.
 *
 * Shows every factor rather than just the score, because "68" tells you
 * nothing you can act on, whereas "your longest recent outing is 8 km against
 * this route's 20 km" tells you exactly what to train.
 */
export function ReadinessPanel({
  readiness,
  onConnectDevices,
}: {
  readiness: Readiness;
  onConnectDevices?: () => void;
}) {
  const color = READINESS_COLORS[readiness.level];

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
        <Gauge aria-hidden="true" className="h-3.5 w-3.5" />
        Your readiness
      </h3>

      <div className="rounded-lg border border-white/[0.06] bg-slate-800/60 p-4">
        <div className="flex items-center gap-4">
          {readiness.score == null ? (
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/15">
              <ActivityIcon aria-hidden="true" className="h-5 w-5 text-slate-600" />
            </div>
          ) : (
            <div
              role="img"
              aria-label={`Readiness ${readiness.score} out of 100: ${readiness.label}`}
              className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center"
            >
              <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
                <circle cx="28" cy="28" r="24" fill="none" stroke="#1e293b" strokeWidth="5" />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  fill="none"
                  stroke={color}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - readiness.score / 100)}
                  transform="rotate(-90 28 28)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <span className="font-tabular absolute text-sm font-bold text-white">
                {readiness.score}
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold" style={{ color }}>
              {readiness.label}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{readiness.summary}</p>
          </div>
        </div>

        {readiness.factors.length > 0 && (
          <dl className="mt-4 space-y-2 border-t border-white/[0.06] pt-3">
            {readiness.factors.map((factor) => (
              <div key={factor.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <dt className="text-[11px] text-slate-400">{factor.label}</dt>
                  <dd className="font-tabular text-[11px] text-slate-300">
                    {factor.capacity} <span className="text-slate-600">of</span> {factor.demand}
                  </dd>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${factor.score}%`,
                      backgroundColor:
                        READINESS_COLORS[
                          factor.score >= 80
                            ? 'ready'
                            : factor.score >= 60
                              ? 'nearly'
                              : factor.score >= 40
                                ? 'build'
                                : 'not-yet'
                        ],
                    }}
                  />
                </div>
              </div>
            ))}
          </dl>
        )}

        {readiness.score != null && <TrainingPlanPanel readiness={readiness} />}

        {readiness.score == null && onConnectDevices && (
          <button
            type="button"
            onClick={onConnectDevices}
            className={`${buttonSecondary} ${buttonSize.sm} mt-4 w-full`}
          >
            Connect your training
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The plan that closes the readiness gap.
 *
 * Collapsed by default: the answer most people want is the one sentence, and
 * the week-by-week table is for the person who has decided to commit.
 */
export function TrainingPlanPanel({ readiness }: { readiness: Readiness }) {
  const [expanded, setExpanded] = useState(false);
  const plan = buildTrainingPlan(readiness);

  // Nothing useful to say without training data — the readiness panel above
  // already asks them to connect a device.
  if (plan.status === 'unknown') return null;

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-4">
      <div className="flex items-start gap-2.5">
        <CalendarRange
          aria-hidden="true"
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-200">
            {plan.status === 'ready'
              ? 'No training needed'
              : plan.status === 'plan'
                ? `${plan.weeks} ${plan.weeks === 1 ? 'week' : 'weeks'} of build-up`
                : 'Training plan'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{plan.summary}</p>
        </div>
      </div>

      {plan.targets.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className={`${buttonGhost} ${buttonSize.sm} mt-2 w-full justify-start`}
          >
            {expanded ? 'Hide weekly targets' : 'Show weekly targets'}
          </button>

          {expanded && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-white/[0.06]">
              <table className="w-full text-left">
                <thead className="bg-white/[0.04]">
                  <tr>
                    {[
                      'Week',
                      'Longest',
                      'Weekly',
                      ...(plan.targets[0].ascentM != null ? ['Climb'] : []),
                    ].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {plan.targets.map((target) => (
                    <tr key={target.week}>
                      <th
                        scope="row"
                        className="font-tabular px-3 py-1.5 text-left text-[11px] font-semibold text-slate-300"
                      >
                        {target.week}
                      </th>
                      <td className="font-tabular px-3 py-1.5 text-[11px] text-slate-300">
                        {target.longestKm} km
                      </td>
                      <td className="font-tabular px-3 py-1.5 text-[11px] text-slate-300">
                        {target.weeklyKm} km
                      </td>
                      {target.ascentM != null && (
                        <td className="font-tabular px-3 py-1.5 text-[11px] text-slate-300">
                          {target.ascentM} m
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* We know their recorded distances and nothing else — not their
              history, injuries or age. Say what this is. */}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            A 10%-per-week progression from your own recorded training. A guideline, not coaching —
            adjust it to how you actually feel.
          </p>
        </>
      )}
    </div>
  );
}
