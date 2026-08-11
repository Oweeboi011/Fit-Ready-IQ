'use client';

import { Car, Footprints, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { decodePolyline } from '@/lib/polylineDecoder';
import { buttonGhost, buttonSize } from '@/lib/ui';

export interface DirectionsTarget {
  name: string;
  /** GeoJSON order, `[lng, lat]`, as everywhere else in the app. */
  coordinates: [number, number];
}

export type TravelMode = 'DRIVING' | 'WALKING';

interface MapDirectionsProps {
  map: google.maps.Map | null;
  origin: { lat: number; lng: number } | null;
  target: DirectionsTarget | null;
  onClear: () => void;
}

interface Leg {
  distance: string;
  duration: string;
}

/** Drive / walk switch, behaving as a radiogroup should. */
function ModeToggle({ mode, onChange }: { mode: TravelMode; onChange: (m: TravelMode) => void }) {
  const options = [
    { id: 'DRIVING' as const, label: 'Drive', Icon: Car },
    { id: 'WALKING' as const, label: 'Walk', Icon: Footprints },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Travel mode"
      className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
    >
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          tabIndex={mode === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();
            onChange(mode === 'DRIVING' ? 'WALKING' : 'DRIVING');
          }}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
            mode === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Icon aria-hidden="true" className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Directions drawn on our own map.
 *
 * Every "Get Directions" button used to be an `<a target="_blank">` to Google
 * Maps, which handed the user to another product mid-task and lost everything
 * they had on screen. The route is rendered here instead, over the same terrain
 * and markers they were already looking at.
 *
 * The link out still exists inside the summary, because for turn-by-turn
 * navigation on the trailhead drive Google Maps is genuinely the right tool —
 * it is just no longer the only option.
 *
 * Routing goes through `/api/directions` (Routes API). The client-side
 * `DirectionsService` this used to call is the legacy Directions API, which
 * Google no longer enables on new projects.
 */
export function MapDirections({ map, origin, target, onClear }: MapDirectionsProps) {
  const [mode, setMode] = useState<TravelMode>('DRIVING');
  const [leg, setLeg] = useState<Leg | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const lineRef = useRef<google.maps.Polyline | null>(null);

  // One polyline for the lifetime of the map, redrawn per destination.
  useEffect(() => {
    if (!map) return;
    const line = new google.maps.Polyline({
      map,
      path: [],
      strokeColor: '#3b82f6',
      strokeWeight: 5,
      strokeOpacity: 0.9,
      zIndex: 500,
    });
    lineRef.current = line;
    return () => {
      line.setMap(null);
      lineRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;

    if (!target || !origin) {
      line.setPath([]);
      setLeg(null);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setLeg(null);

    fetch('/api/directions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin,
        destination: { lat: target.coordinates[1], lng: target.coordinates[0] },
        mode: mode === 'DRIVING' ? 'DRIVE' : 'WALK',
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Routing responded ${res.status}`);
        return res.json();
      })
      .then((data: { polyline: string; distanceKm: number; durationSeconds: number }) => {
        if (cancelled) return;
        const path = decodePolyline(data.polyline);
        line.setPath(path.map(([lng, lat]) => ({ lat, lng })));

        const minutes = Math.round(data.durationSeconds / 60);
        setLeg({
          distance: `${data.distanceKm.toFixed(1)} km`,
          duration:
            minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`,
        });
        setStatus('idle');

        // Frame the route so it is not off-screen.
        const bounds = new google.maps.LatLngBounds();
        path.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
        map?.fitBounds(bounds, 80);
      })
      .catch((err) => {
        if (cancelled) return;
        // ZERO_RESULTS is meaningful: there is often no drivable route to a
        // summit. Say so rather than showing an empty map.
        console.error('Directions failed:', err);
        line.setPath([]);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [map, origin, target, mode]);

  if (!target) return null;

  const externalUrl = `https://www.google.com/maps/dir/?api=1&destination=${target.coordinates[1]},${target.coordinates[0]}&travelmode=${mode.toLowerCase()}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 z-30 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto w-[min(26rem,100%)] rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Directions to
            </p>
            <p className="truncate text-sm font-semibold text-white">{target.name}</p>
          </div>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear directions"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} />

          {status === 'loading' && <span className="text-[11px] text-slate-400">Routing…</span>}
          {status === 'error' && (
            <span className="text-[11px] text-amber-300">
              No {mode === 'DRIVING' ? 'driving' : 'walking'} route found.
            </span>
          )}
          {status === 'idle' && leg && (
            <span className="font-tabular text-[11px] text-slate-300">
              <span className="font-semibold text-white">{leg.duration}</span> · {leg.distance}
            </span>
          )}

          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonGhost} ${buttonSize.sm} ml-auto flex-shrink-0`}
          >
            Navigate
          </a>
        </div>
      </div>
    </div>
  );
}
