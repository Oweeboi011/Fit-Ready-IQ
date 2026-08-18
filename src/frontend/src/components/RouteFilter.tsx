'use client';

import { useState } from 'react';
import {
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Backpack,
  Bike,
  Map as MapIcon,
  Mountain,
} from 'lucide-react';

interface RouteFilterProps {
  /**
   * Current filters, owned by the page.
   *
   * This used to be local state. Because the panel only mounts on the routes
   * tab, switching to Peaks unmounted it and silently reset every filter, while
   * the parent's `filteredRoutes` stayed filtered — so the list and the controls
   * disagreed and nothing on screen explained why.
   */
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
  activityTypes: string[];
  difficulty: string[];
  maxDistance: number;
  minElevation: number;
  maxElevation: number;
}

const activityOptions = [
  {
    value: 'hike',
    label: 'Backpacking',
    Icon: Backpack,
    activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40 ring-1 ring-sky-500/30',
  },
  {
    value: 'bike',
    label: 'Bikepacking',
    Icon: Bike,
    activeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/40 ring-1 ring-violet-500/30',
  },
  {
    value: 'rock_climb',
    label: 'Rock Climbing',
    Icon: Mountain,
    activeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40 ring-1 ring-orange-500/30',
  },
  {
    value: 'tour',
    label: 'Touring',
    Icon: MapIcon,
    activeClass:
      'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/30',
  },
];

const difficultyOptions = [
  {
    value: 'easy',
    label: 'Easy',
    dot: 'bg-emerald-500',
    activeClass:
      'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/30',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    dot: 'bg-amber-500',
    activeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30',
  },
  {
    value: 'challenging',
    label: 'Challenging',
    dot: 'bg-red-500',
    activeClass: 'bg-red-500/15 text-red-300 border-red-500/40 ring-1 ring-red-500/30',
  },
  {
    value: 'unknown',
    label: 'Unrated',
    dot: 'bg-slate-500',
    activeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/40 ring-1 ring-slate-500/30',
  },
];

export const DEFAULT_FILTERS: FilterState = {
  activityTypes: [],
  difficulty: [],
  maxDistance: 50,
  minElevation: 0,
  maxElevation: 3000,
};

export default function RouteFilter({ filters, onFilterChange }: RouteFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeCount = filters.activityTypes.length + filters.difficulty.length;

  const toggleActivityType = (type: string) => {
    const newTypes = filters.activityTypes.includes(type)
      ? filters.activityTypes.filter((t) => t !== type)
      : [...filters.activityTypes, type];
    onFilterChange({ ...filters, activityTypes: newTypes });
  };

  const toggleDifficulty = (diff: string) => {
    const newDiff = filters.difficulty.includes(diff)
      ? filters.difficulty.filter((d) => d !== diff)
      : [...filters.difficulty, diff];
    onFilterChange({ ...filters, difficulty: newDiff });
  };

  const updateDistance = (distance: number) => {
    onFilterChange({ ...filters, maxDistance: distance });
  };

  const updateElevation = (min: number, max: number) => {
    onFilterChange({ ...filters, minElevation: min, maxElevation: max });
  };

  const resetFilters = () => onFilterChange(DEFAULT_FILTERS);

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.08] bg-ink/[0.03]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-ink/[0.06]">
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">Filters</span>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-ink/[0.06] hover:text-slate-300"
              title="Reset all filters"
            >
              <RotateCcw aria-hidden="true" className="h-3 w-3" />
              Reset
            </button>
          )}
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-ink/[0.06] hover:text-slate-300"
          >
            {isExpanded ? (
              <>
                <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
                Less
              </>
            ) : (
              <>
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                More
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="space-y-4 p-4">
        {/* Activity */}
        <div>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Activity Type
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activityOptions.map((opt) => {
              const active = filters.activityTypes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleActivityType(opt.value)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    active
                      ? opt.activeClass
                      : 'border-ink/[0.08] bg-ink/[0.04] text-slate-400 hover:bg-ink/[0.08] hover:text-slate-300'
                  }`}
                >
                  <opt.Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Difficulty
          </p>
          <div className="flex flex-wrap gap-1.5">
            {difficultyOptions.map((opt) => {
              const active = filters.difficulty.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDifficulty(opt.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    active
                      ? opt.activeClass
                      : 'border-ink/[0.08] bg-ink/[0.04] text-slate-400 hover:bg-ink/[0.08] hover:text-slate-300'
                  }`}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${opt.dot} ${active ? 'shadow-sm' : 'opacity-60'}`}
                  />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      {isExpanded && (
        <div className="space-y-5 border-t border-ink/[0.06] p-4">
          {/* Distance */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Max Distance
              </p>
              <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-400">
                {filters.maxDistance.toLocaleString()} km
              </span>
            </div>
            <div className="relative">
              <input
                type="range"
                aria-label="Maximum route distance"
                aria-valuetext={`${filters.maxDistance} kilometres`}
                min="1"
                max="10000"
                value={filters.maxDistance}
                onChange={(e) => updateDistance(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer rounded-full accent-blue-500"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(filters.maxDistance / 10000) * 100}%, rgba(255,255,255,0.1) ${(filters.maxDistance / 10000) * 100}%, rgba(255,255,255,0.1) 100%)`,
                }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-slate-600">
              <span>1 km</span>
              <span>10,000 km</span>
            </div>
          </div>

          {/* Elevation Gain */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Elevation Gain
              </p>
              <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                {filters.minElevation}–{filters.maxElevation} m
              </span>
            </div>
            <div className="space-y-2">
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-slate-600">
                  <span>Min</span>
                  <span>{filters.minElevation} m</span>
                </div>
                <input
                  type="range"
                  aria-label="Minimum elevation gain"
                  aria-valuetext={`${filters.minElevation} metres`}
                  min="0"
                  max="3000"
                  value={filters.minElevation}
                  onChange={(e) => updateElevation(Number(e.target.value), filters.maxElevation)}
                  className="h-1.5 w-full cursor-pointer rounded-full accent-emerald-500"
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${(filters.minElevation / 3000) * 100}%, rgba(255,255,255,0.1) ${(filters.minElevation / 3000) * 100}%, rgba(255,255,255,0.1) 100%)`,
                  }}
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-slate-600">
                  <span>Max</span>
                  <span>{filters.maxElevation} m</span>
                </div>
                <input
                  type="range"
                  aria-label="Maximum elevation gain"
                  aria-valuetext={`${filters.maxElevation} metres`}
                  min="0"
                  max="3000"
                  value={filters.maxElevation}
                  onChange={(e) => updateElevation(filters.minElevation, Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer rounded-full accent-emerald-500"
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${(filters.maxElevation / 3000) * 100}%, rgba(255,255,255,0.1) ${(filters.maxElevation / 3000) * 100}%, rgba(255,255,255,0.1) 100%)`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
