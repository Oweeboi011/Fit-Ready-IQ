'use client';

import { MapPin, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { buttonPrimary, buttonSize } from '@/lib/ui';
import { usePlaceSearch, type PlaceSearchResult } from '@/lib/usePlaceSearch';

/**
 * Search for a place on the map, and plan from it.
 *
 * The sidebar's box only filters what discovery already loaded, so anywhere
 * outside the current radius could not be found — and therefore could not be
 * added to a plan. This finds a place by name and turns it into a waypoint.
 *
 * "Add" is the single primary action, because starting a route from a searched
 * place is the reason anyone opens this. Selecting a result without adding it
 * just moves the map there, which is the other, quieter reason.
 */

export interface MapSearchProps {
  /** Biases results towards the user. Search is disabled without it. */
  near: [number, number] | undefined;
  /** Moves the map. Kept separate from adding, so looking is not committing. */
  onGoTo: (coordinates: [number, number]) => void;
  /**
   * Adds the place to the plan, opening the planner if it is closed — the caller
   * owns that, since it owns the planner's state.
   */
  onAddToPlan: (coordinates: [number, number], name: string) => void;
  plannerOpen: boolean;
}

export default function MapSearch({ near, onGoTo, onAddToPlan, plannerOpen }: MapSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /**
   * Which row is highlighted, scoped to the query it belongs to.
   *
   * Storing the query alongside the index makes the reset *derived*: a new set of
   * results is a new query, so the highlight falls back to the first row without
   * an effect that fires on every response.
   */
  const [highlight, setHighlight] = useState({ forQuery: '', index: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const { results, loading, empty } = usePlaceSearch(query, near);

  // Collapse when the user clicks the map behind the panel, which is the usual
  // way of saying "never mind" — Escape is handled on the input for the keyboard.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const activeIndex =
    highlight.forQuery === query ? Math.min(highlight.index, Math.max(results.length - 1, 0)) : 0;
  const setActiveIndex = (index: number) => setHighlight({ forQuery: query, index });

  function choose(result: PlaceSearchResult) {
    onGoTo(result.coordinates);
    setOpen(false);
  }

  function add(result: PlaceSearchResult) {
    onAddToPlan(result.coordinates, result.name);
    onGoTo(result.coordinates);
    // Left open on purpose: building a route means adding several places, and
    // reopening the panel for each one is the tedious version of this feature.
    setQuery('');
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!results.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((activeIndex + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((activeIndex - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // Enter does the thing the panel is for when a plan is open, and the
      // gentler thing when it is not.
      const result = results[activeIndex];
      if (result) (plannerOpen ? add : choose)(result);
    }
  }

  const showPanel = open && (loading || empty || results.length > 0);

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto absolute left-3 top-3 z-20 w-[min(22rem,calc(100%-1.5rem))]"
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-slate-500"
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="map-search-results"
          aria-label="Search for a place to add to your plan"
          placeholder={near ? 'Search a peak, trail or town…' : 'Waiting for your location…'}
          disabled={!near}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-ink/10 bg-slate-950/90 py-2.5 pl-9 pr-9 text-[13px] text-slate-200 placeholder-slate-500 shadow-lg outline-none backdrop-blur transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            className="absolute inset-y-0 right-2.5 my-auto flex items-center text-slate-500 hover:text-slate-300"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showPanel && (
        <ul
          id="map-search-results"
          role="listbox"
          className="mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-ink/10 bg-slate-950/95 py-1 shadow-xl backdrop-blur"
        >
          {loading && <li className="px-3 py-2 text-[11px] text-slate-500">Searching…</li>}

          {/* Said plainly. An empty list with no message reads as a broken box. */}
          {empty && !loading && (
            <li className="px-3 py-2 text-[11px] text-slate-500">
              Nothing found for “{query.trim()}”. Try a different spelling, or a nearby town.
            </li>
          )}

          {results.map((result, index) => (
            <li
              key={result.id}
              role="option"
              aria-selected={index === activeIndex}
              className={`flex items-center gap-2 px-2 py-1.5 ${
                index === activeIndex ? 'bg-ink/[0.06]' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => choose(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-slate-200">
                    {result.name}
                  </span>
                  {result.address && (
                    <span className="block truncate text-[10px] text-slate-500">
                      {result.address}
                    </span>
                  )}
                </span>
              </button>

              {/* The reason this box exists, so it gets the primary treatment —
                  and there is only ever one visible at a time in this panel. */}
              <button
                type="button"
                onClick={() => add(result)}
                aria-label={`Add ${result.name} to your plan`}
                className={`${buttonPrimary} ${buttonSize.sm} flex-shrink-0`}
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
