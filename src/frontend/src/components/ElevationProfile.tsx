'use client';

import { useId, useMemo, useRef, useState } from 'react';

import {
  distanceTicks,
  profileRange,
  profileSegments,
  sampleAtRatio,
  summarizeProfile,
  type ElevationSample,
  type ProfileBox,
  type ProfileSegment,
  type ProfileSummary,
} from '@/lib/elevationProfile';

/**
 * Distance-versus-elevation profile, the shape every mapping product shows for a
 * route and the one this app was missing.
 *
 * An area chart because the data's job is magnitude over a continuous axis: the
 * filled shape *is* the terrain, which is what makes it readable in a 96px strip.
 * One series, so no legend — the caption names it, and a legend box for a single
 * thing is furniture. Inline SVG rather than a charting library: this is a path
 * and a crosshair, and a dependency would outweigh the whole feature.
 *
 * Honesty rules inherited from the rest of the codebase:
 *   - gaps in the data break the line rather than being bridged
 *   - the y-axis is fitted, not zero-based, and therefore always labels the real
 *     min and max — a 180 m hill drawn from sea level is a flat line, but a
 *     fitted axis without annotation flatters a gentle route
 *   - nothing renders when no elevation is known
 *
 * A synthesized version of this chart previously stood in DetailsModal and was
 * removed for inventing terrain with `Math.sin(progress * PI * 4)`. This one only
 * ever plots measured samples.
 */

export interface ElevationProfileProps {
  samples: ElevationSample[];
  /** Shown while the lookup is in flight, so the strip does not flash empty. */
  loading?: boolean;
  /** Why there is no profile, when we know. */
  error?: string | null;
  className?: string;
}

/** 2px, per the mark spec — a data line should not read as a border. */
const LINE_WIDTH = 2;

const BOX: ProfileBox = {
  width: 320,
  height: 96,
  padding: { top: 8, right: 4, bottom: 14, left: 30 },
};

const PLOT = {
  left: BOX.padding.left,
  right: BOX.width - BOX.padding.right,
  top: BOX.padding.top,
  bottom: BOX.height - BOX.padding.bottom,
};

function formatKm(km: number): string {
  return km >= 10 ? `${Math.round(km)}` : `${km.toFixed(1)}`;
}

interface PlotProps {
  samples: ElevationSample[];
  summary: ProfileSummary;
  range: { low: number; high: number };
  segments: ProfileSegment[];
  totalKm: number;
  hovered: ElevationSample | null;
  onMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onLeave: () => void;
  svgRef: React.RefObject<SVGSVGElement>;
}

/** The plot itself. Split out to keep each piece within the size ceilings. */
function ProfilePlot({
  summary,
  range,
  segments,
  totalKm,
  hovered,
  onMove,
  onLeave,
  svgRef,
}: PlotProps) {
  const clipId = useId();

  const hoverX =
    hovered && totalKm > 0
      ? PLOT.left + (hovered.distanceKm / totalKm) * (PLOT.right - PLOT.left)
      : null;
  const hoverY =
    hovered?.elevationM != null
      ? PLOT.top +
        (1 - (hovered.elevationM - range.low) / (range.high - range.low || 1)) *
          (PLOT.bottom - PLOT.top)
      : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      className="h-24 w-full touch-none"
      preserveAspectRatio="none"
      role="img"
      aria-label={
        `Elevation profile over ${formatKm(totalKm)} kilometres: ` +
        `${summary.ascentM} metres of ascent, ${summary.descentM} of descent, ` +
        `between ${summary.minM} and ${summary.maxM} metres above sea level.`
      }
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={PLOT.left}
            y={PLOT.top}
            width={PLOT.right - PLOT.left}
            height={PLOT.bottom - PLOT.top}
          />
        </clipPath>
      </defs>

      {/* Recessive grid: two rules only, at the min and max, so the eye has a
          reference without the chart turning into a table. */}
      {[PLOT.top, PLOT.bottom].map((y) => (
        <line
          key={y}
          x1={PLOT.left}
          x2={PLOT.right}
          y1={y}
          y2={y}
          stroke="var(--chart-elevation-grid)"
          strokeWidth={1}
        />
      ))}

      <g clipPath={`url(#${clipId})`}>
        {segments.map((segment, i) => (
          <path key={`area-${i}`} d={segment.area} fill="var(--chart-elevation-fill)" />
        ))}
        {segments.map((segment, i) => (
          <path
            key={`line-${i}`}
            d={segment.line}
            fill="none"
            stroke="var(--chart-elevation-line)"
            strokeWidth={LINE_WIDTH}
            strokeLinejoin="round"
            strokeLinecap="round"
            // The viewBox is non-uniformly scaled, so without this the stroke
            // would be stretched horizontally along with the geometry.
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {/* Crosshair, shipped by default on an area chart — reading a value off a
          96px strip by eye is guesswork otherwise. */}
      {hoverX != null && (
        <line
          x1={hoverX}
          x2={hoverX}
          y1={PLOT.top}
          y2={PLOT.bottom}
          stroke="var(--chart-elevation-line)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
      {hoverX != null && hoverY != null && (
        <circle
          cx={hoverX}
          cy={hoverY}
          r={4}
          fill="var(--chart-elevation-line)"
          // A 2px surface ring keeps the marker legible over the fill.
          stroke="var(--surface-base)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Axis labels in ink tokens, never the series colour. */}
      <text x={0} y={PLOT.top + 4} className="fill-slate-500 text-[8px]">
        {summary.maxM}
      </text>
      <text x={0} y={PLOT.bottom} className="fill-slate-500 text-[8px]">
        {summary.minM}
      </text>
      {distanceTicks(totalKm).map((km) => (
        <text
          key={km}
          x={PLOT.left + (km / (totalKm || 1)) * (PLOT.right - PLOT.left)}
          y={BOX.height - 3}
          textAnchor="end"
          className="fill-slate-500 text-[8px]"
        >
          {formatKm(km)}
        </text>
      ))}
    </svg>
  );
}

export default function ElevationProfile({
  samples,
  loading = false,
  error = null,
  className = '',
}: ElevationProfileProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const summary = useMemo(() => summarizeProfile(samples), [samples]);
  const range = useMemo(() => (summary ? profileRange(summary) : null), [summary]);
  const segments = useMemo(
    () => (range ? profileSegments(samples, BOX, range) : []),
    [samples, range]
  );

  // Each state below is distinct on purpose: "still loading", "we asked and could
  // not find out", and "there is nothing to show" are three different things, and
  // collapsing them is how a failed lookup reads as flat ground.
  if (loading) {
    return <div className={`skeleton h-24 w-full rounded-lg ${className}`} aria-hidden="true" />;
  }
  if (error) {
    return <p className={`text-[11px] leading-relaxed text-slate-500 ${className}`}>{error}</p>;
  }
  if (!summary || !range || segments.length === 0) {
    return (
      <p className={`text-[11px] text-slate-500 ${className}`}>
        Elevation unavailable for this route.
      </p>
    );
  }

  const totalKm = samples[samples.length - 1].distanceKm;
  const hovered = hoverRatio == null ? null : sampleAtRatio(samples, hoverRatio);

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    // Ratio within the plot area, not the whole SVG — the left gutter holds labels.
    const plotWidthPx = bounds.width * ((PLOT.right - PLOT.left) / BOX.width);
    const originPx = bounds.left + bounds.width * (PLOT.left / BOX.width);
    setHoverRatio((event.clientX - originPx) / plotWidthPx);
  }

  return (
    <figure className={`m-0 ${className}`}>
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Elevation
        </span>
        {/* Direct labels rather than a ticked y-axis: ascent and descent are the
            two numbers anyone actually wants from a profile. */}
        <span className="font-tabular text-[10px] text-slate-400">
          ↑ {summary.ascentM} m · ↓ {summary.descentM} m
        </span>
      </figcaption>

      <ProfilePlot
        samples={samples}
        summary={summary}
        range={range}
        segments={segments}
        totalKm={totalKm}
        hovered={hovered}
        onMove={onMove}
        onLeave={() => setHoverRatio(null)}
        svgRef={svgRef}
      />

      <p className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-slate-500">
        <span className="font-tabular">
          {hovered?.elevationM != null
            ? `${formatKm(hovered.distanceKm)} km · ${hovered.elevationM} m`
            : `${summary.minM}–${summary.maxM} m`}
        </span>
        {/* A partial profile says so rather than passing known ground off as the
            whole route. */}
        {summary.coverage < 1 && (
          <span>{Math.round(summary.coverage * 100)}% of route measured</span>
        )}
      </p>
    </figure>
  );
}
