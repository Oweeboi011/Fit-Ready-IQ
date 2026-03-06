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
    { value: "hike", label: "Hiking", icon: "🥾" },
    { value: "bike", label: "Biking", icon: "🚴" },
    { value: "run", label: "Running", icon: "🏃" },
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
    <div className="rounded-lg bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Filter Routes</h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* Quick Filters (Always Visible) */}
      <div className="p-4">
        <div className="mb-3">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Activity Type
          </label>
          <div className="flex flex-wrap gap-2">
            {activityOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleActivityType(option.value)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  filters.activityTypes.includes(option.value)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <span>{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Difficulty
          </label>
          <div className="flex flex-wrap gap-2">
            {difficultyOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleDifficulty(option.value)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  filters.difficulty.includes(option.value)
                    ? "ring-2 ring-offset-2 ring-gray-400"
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                <div className={`h-3 w-3 rounded-full ${option.color}`} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced Filters (Expandable) */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Distance */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Max Distance: {filters.maxDistance.toLocaleString()} km
            </label>
            <input
              type="range"
              min="1"
              max="10000"
              value={filters.maxDistance}
              onChange={(e) => updateDistance(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>1 km</span>
              <span>10,000 km</span>
            </div>
          </div>

          {/* Elevation */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Elevation Gain: {filters.minElevation}m - {filters.maxElevation}m
            </label>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="3000"
                value={filters.minElevation}
                onChange={(e) => updateElevation(Number(e.target.value), filters.maxElevation)}
                className="w-full accent-blue-600"
              />
              <input
                type="range"
                min="0"
                max="3000"
                value={filters.maxElevation}
                onChange={(e) => updateElevation(filters.minElevation, Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>0 m</span>
              <span>3000 m</span>
            </div>
          </div>

          {/* Reset Button */}
          <button
            onClick={resetFilters}
            className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}
