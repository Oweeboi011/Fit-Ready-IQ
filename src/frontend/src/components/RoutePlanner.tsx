'use client';

import {
  Bike,
  Download,
  FolderOpen,
  Footprints,
  GripVertical,
  MapPin,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildGpx, gpxFilename, type PlannerWaypoint } from '@/lib/gpxBuilder';
import { deletePlan, loadPlans, savePlan, type SavedPlan } from '@/lib/savedPlans';
import type { PlannerRoute, PlannerTravelMode } from '@/lib/usePlannerRoute';
import { buttonGhost, buttonPrimary, buttonSecondary, buttonSize } from '@/lib/ui';

interface RoutePlannerProps {
  isOpen: boolean;
  waypoints: PlannerWaypoint[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onClear: () => void;
  onLoadPlan: (waypoints: PlannerWaypoint[]) => void;
  /** Routed line through the waypoints, or an error saying why there is none. */
  route: PlannerRoute;
  travelMode: PlannerTravelMode;
  onTravelModeChange: (mode: PlannerTravelMode) => void;
}

/** Sum of the positive elevation steps we know about. */
function totalAscentM(waypoints: PlannerWaypoint[]): number | null {
  const known = waypoints.filter((w) => w.elevation != null);
  if (known.length < 2) return null;
  let gain = 0;
  for (let i = 1; i < known.length; i++) {
    const delta = known[i].elevation! - known[i - 1].elevation!;
    if (delta > 0) gain += delta;
  }
  return Math.round(gain);
}

/**
 * Distance and ascent — or the reason there are none.
 *
 * There is no fallback figure. When routing fails the panel says so and shows
 * nothing else: the straight-line distance this used to display was always short
 * and was still what got saved and exported.
 */
function RouteSummary({ route, ascent }: { route: PlannerRoute; ascent: number | null }) {
  const failed = route.status === 'error';

  return (
    <div
      className={`mt-3 flex items-center gap-3 rounded-lg border px-3 py-2 ${
        failed ? 'border-amber-500/25 bg-amber-500/[0.07]' : 'border-ink/[0.06] bg-ink/[0.03]'
      }`}
    >
      {failed ? (
        <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
      ) : (
        <MapPin aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
      )}
      <div className="min-w-0">
        {failed ? (
          <>
            <p className="text-xs font-semibold text-amber-200">No route</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{route.error}</p>
          </>
        ) : (
          <>
            <p className="font-tabular text-xs font-semibold text-white">
              {route.status === 'routing' || route.distanceKm == null
                ? 'Routing…'
                : `${route.distanceKm.toFixed(1)} km`}
              {ascent != null && ` · ${ascent} m up`}
            </p>
            <p className="text-[10px] text-slate-500">
              {route.mode === 'cycling' ? 'Following cycling routes' : 'Following walking paths'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Walk or bike.
 *
 * Not a display preference — it changes the request. Cycling routing prefers
 * cycleways and roads and refuses steps and footpaths a bike cannot ride, so the
 * same waypoints give a different line and a different distance. A radiogroup
 * rather than two buttons, so arrow keys move between them and a screen reader
 * announces it as one choice with two options.
 */
function TravelModeToggle({
  value,
  onChange,
}: {
  value: PlannerTravelMode;
  onChange: (mode: PlannerTravelMode) => void;
}) {
  const options: { id: PlannerTravelMode; label: string; Icon: typeof Footprints }[] = [
    { id: 'walk', label: 'Walk', Icon: Footprints },
    { id: 'bike', label: 'Bike', Icon: Bike },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Travel mode"
      className="mt-3 flex gap-1 rounded-lg border border-ink/[0.06] bg-ink/[0.03] p-1"
    >
      {options.map(({ id, label, Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              selected
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-ink/[0.06] hover:text-white'
            }`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** The ordered waypoint list, lifted out to keep the planner itself readable. */
function WaypointList({
  waypoints,
  onRemove,
  onMove,
}: {
  waypoints: PlannerWaypoint[];
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <ol className="mt-3 max-h-52 space-y-1 overflow-y-auto">
      {waypoints.map((w, index) => (
        <li
          key={w.id}
          className="flex items-center gap-2 rounded-lg border border-ink/[0.06] bg-ink/[0.03] px-2 py-1.5"
        >
          <span className="font-tabular flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">{w.name}</span>
          <div className="flex flex-shrink-0 items-center">
            <button
              type="button"
              onClick={() => onMove(w.id, -1)}
              disabled={index === 0}
              aria-label={`Move ${w.name} earlier`}
              className="flex h-7 w-5 items-center justify-center rounded text-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-25"
            >
              <GripVertical aria-hidden="true" className="h-3 w-3 rotate-90" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(w.id)}
              aria-label={`Remove ${w.name}`}
              className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <Trash2 aria-hidden="true" className="h-3 w-3" />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Collapsible list of saved plans, with its own open/closed state. */
function SavedPlansDrawer({
  plans,
  onOpen,
  onDelete,
}: {
  plans: SavedPlan[];
  onOpen: (plan: SavedPlan) => void;
  onDelete: (id: string) => void;
}) {
  const [showSaved, setShowSaved] = useState(false);

  return (
    <div className="mt-3 border-t border-ink/[0.06] pt-3">
      <button
        type="button"
        onClick={() => setShowSaved((v) => !v)}
        aria-expanded={showSaved}
        className={`${buttonGhost} ${buttonSize.sm} w-full justify-start`}
      >
        <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
        Saved plans ({plans.length})
      </button>
      {showSaved && (
        <SavedPlanList
          plans={plans}
          onOpen={(plan) => {
            onOpen(plan);
            setShowSaved(false);
          }}
          onDelete={onDelete}
        />
      )}
      <p className="mt-2 px-2 text-[10px] text-slate-600">Plans stay on this device.</p>
    </div>
  );
}

function SavedPlanList({
  plans,
  onOpen,
  onDelete,
}: {
  plans: SavedPlan[];
  onOpen: (plan: SavedPlan) => void;
  onDelete: (id: string) => void;
}) {
  if (plans.length === 0) {
    return (
      <p className="px-2 py-2 text-[11px] text-slate-500">
        Nothing saved yet. Build a route and press Save plan.
      </p>
    );
  }

  return (
    <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
      {plans.map((plan) => (
        <li
          key={plan.id}
          className="flex items-center gap-1 rounded-lg border border-ink/[0.06] bg-ink/[0.03] px-2 py-1.5"
        >
          <button
            type="button"
            onClick={() => onOpen(plan)}
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <span className="block truncate text-[11px] text-slate-200">{plan.name}</span>
            <span className="font-tabular block text-[9px] text-slate-500">
              {plan.waypoints.length} waypoints
              {plan.distanceKm == null ? ' · not routed' : ` · ${plan.distanceKm.toFixed(1)} km`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(plan.id)}
            aria-label={`Delete ${plan.name}`}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-slate-500 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Trash2 aria-hidden="true" className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Route planner.
 *
 * A floating panel rather than a route of its own, so the map stays visible and
 * clickable underneath — planning a line across terrain you cannot see would be
 * pointless.
 *
 * Distances come from the router, on foot or by bike, and from nowhere else.
 * When the router cannot join the waypoints the panel shows no line and no
 * number and says why — the straight-line fallback that used to fill the gap was
 * always short, and it was still what got saved and exported.
 *
 * The routing engine has no trail data, so a route over unmapped ground will
 * fail rather than approximate. That is the intended outcome: a road-routed
 * distance presented as a trail distance is exactly the plausible-but-wrong
 * number this app has been busy removing.
 */
export function RoutePlanner({
  isOpen,
  waypoints,
  onClose,
  onRemove,
  onMove,
  onClear,
  onLoadPlan,
  route,
  travelMode,
  onTravelModeChange,
}: RoutePlannerProps) {
  const [name, setName] = useState('');
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [justSaved, setJustSaved] = useState(false);
  /** Set when editing a saved plan, so Save updates it rather than duplicating. */
  const [editingId, setEditingId] = useState<string | null>(null);

  // Read after mount, never during render — storage reads during render make
  // the server and client disagree on first paint.
  useEffect(() => {
    if (isOpen) setPlans(loadPlans());
  }, [isOpen]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  // No routed distance means the plan is saved without one, rather than with a
  // straight-line stand-in that would read as real in the saved-plan list.
  const distance = route.status === 'ready' ? route.distanceKm : null;
  const ascent = useMemo(() => totalAscentM(waypoints), [waypoints]);

  const handleSave = useCallback(() => {
    if (waypoints.length === 0) return;
    const id = editingId ?? `plan-${Date.now()}`;
    setPlans(
      savePlan({
        id,
        name: name.trim() || 'Untitled route',
        waypoints,
        savedAt: Date.now(),
        distanceKm: distance,
      })
    );
    setEditingId(id);
    setJustSaved(true);
  }, [editingId, name, waypoints, distance]);

  if (!isOpen) return null;

  function handleExport() {
    const routeName = name.trim() || 'Fit Ready IQ route';
    const xml = buildGpx({ name: routeName, waypoints });
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = gpxFilename(routeName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="pointer-events-auto absolute bottom-24 left-4 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-ink/10 bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Planner</h2>
          <p className="mt-0.5 text-[10px] text-slate-500">Tap the map to add a waypoint</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close planner"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-ink/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-4">
        <label htmlFor="planner-name" className="sr-only">
          Route name
        </label>
        <input
          id="planner-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this route"
          maxLength={80}
          className="w-full rounded-lg border border-ink/10 bg-ink/5 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
        />

        {/* Before the waypoints, because it changes how they will be joined. */}
        <TravelModeToggle value={travelMode} onChange={onTravelModeChange} />

        {waypoints.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-ink/10 px-3 py-4 text-center text-[11px] leading-relaxed text-slate-500">
            No waypoints yet. Tap anywhere on the map to drop the first one.
          </p>
        ) : (
          <>
            <WaypointList waypoints={waypoints} onRemove={onRemove} onMove={onMove} />

            <RouteSummary route={route} ascent={ascent} />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                className={`${buttonPrimary} ${buttonSize.sm} flex-1`}
              >
                <Save aria-hidden="true" className="h-3.5 w-3.5" />
                {justSaved ? 'Saved' : editingId ? 'Update' : 'Save plan'}
              </button>
              <button
                type="button"
                onClick={handleExport}
                className={`${buttonSecondary} ${buttonSize.sm}`}
                aria-label="Export as GPX"
              >
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
                GPX
              </button>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setEditingId(null);
                  setName('');
                }}
                className={`${buttonSecondary} ${buttonSize.sm}`}
              >
                Clear
              </button>
            </div>
          </>
        )}

        <SavedPlansDrawer
          plans={plans}
          onOpen={(plan) => {
            onLoadPlan(plan.waypoints);
            setName(plan.name);
            setEditingId(plan.id);
          }}
          onDelete={(id) => {
            setPlans(deletePlan(id));
            if (editingId === id) setEditingId(null);
          }}
        />
      </div>
    </div>
  );
}
