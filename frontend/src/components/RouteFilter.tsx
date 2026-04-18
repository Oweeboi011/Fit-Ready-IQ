"use client";

import { useState } from "react";

interface RouteFilterProps {
  onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
  activityTypes: string[];
  difficulty: string[];
  maxDistance: number;
  minElevation: number;
  maxElevation: number;
}

export default function RouteFilter({ onFilterChange }: RouteFilterProps) {
  const [filters, setFilters] = useState<FilterState>({
    activityTypes: [],
    difficulty: [],
    maxDistance: 50,
    minElevation: 0,
    maxElevation: 3000,
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const activityOptions = [
    { value: "hike", label: "Backpacking", icon: "🎒" },
    { value: "bike", label: "Bikepacking", icon: "🚴" },
    { value: "tour", label: "Touring", icon: "🗺️" },
  ];

  const difficultyOptions = [
    { value: "easy", label: "Easy", color: "bg-green-500" },
    { value: "moderate", label: "Moderate", color: "bg-amber-500" },
    { value: "hard", label: "Hard", color: "bg-red-500" },
  ];

  const toggleActivityType = (type: string) => {
    const newTypes = filters.activityTypes.includes(type)
      ? filters.activityTypes.filter((t) => t !== type)
      : [...filters.activityTypes, type];
    
    const newFilters = { ...filters, activityTypes: newTypes };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const toggleDifficulty = (diff: string) => {
    const newDiff = filters.difficulty.includes(diff)
      ? filters.difficulty.filter((d) => d !== diff)
      : [...filters.difficulty, diff];
    
    const newFilters = { ...filters, difficulty: newDiff };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const updateDistance = (distance: number) => {
    const newFilters = { ...filters, maxDistance: distance };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const updateElevation = (min: number, max: number) => {
    const newFilters = { ...filters, minElevation: min, maxElevation: max };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const resetFilters = () => {
    const defaultFilters: FilterState = {
      activityTypes: [],
      difficulty: [],
      maxDistance: 50,
      minElevation: 0,
      maxElevation: 3000,
    };
    setFilters(defaultFilters);
    onFilterChange(defaultFilters);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🎚️</span>
          <h2 className="text-sm font-semibold text-slate-800">Filters</h2>
          {(filters.activityTypes.length > 0 || filters.difficulty.length > 0) && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
              {filters.activityTypes.length + filters.difficulty.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          {isExpanded ? "Less" : "More"}
        </button>
      </div>

      {/* Quick Filters (Always Visible) */}
      <div className="p-4 space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Activity
          </p>
          <div className="flex flex-wrap gap-2">
            {activityOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleActivityType(option.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                  filters.activityTypes.includes(option.value)
                    ? "bg-blue-500 text-white shadow-sm shadow-blue-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Difficulty
          </p>
          <div className="flex flex-wrap gap-2">
            {difficultyOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleDifficulty(option.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                  filters.difficulty.includes(option.value)
                    ? "ring-2 ring-inset ring-slate-400 bg-slate-50"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 opacity-70 hover:opacity-100"
                }`}
              >
                <div className={`h-2.5 w-2.5 rounded-full ${option.color}`} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced Filters (Expandable) */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {/* Distance */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Max Distance</p>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {filters.maxDistance.toLocaleString()} km
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10000"
              value={filters.maxDistance}
              onChange={(e) => updateDistance(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>1 km</span>
              <span>10,000 km</span>
            </div>
          </div>

          {/* Elevation */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Elevation Gain</p>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {filters.minElevation}–{filters.maxElevation} m
              </span>
            </div>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="3000"
                value={filters.minElevation}
                onChange={(e) => updateElevation(Number(e.target.value), filters.maxElevation)}
                className="w-full accent-blue-500"
              />
              <input
                type="range"
                min="0"
                max="3000"
                value={filters.maxElevation}
                onChange={(e) => updateElevation(filters.minElevation, Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>0 m</span>
              <span>3,000 m</span>
            </div>
          </div>

          {/* Reset Button */}
          <button
            onClick={resetFilters}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}
