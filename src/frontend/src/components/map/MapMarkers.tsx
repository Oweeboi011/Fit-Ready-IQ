'use client';

import { Marker, type MarkerEvent } from '@vis.gl/react-maplibre';
import {
  Bike,
  Bookmark,
  Footprints,
  Map as MapIcon,
  Mountain as MountainIcon,
  Tent,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { KeyboardEvent } from 'react';

import type { Campsite, Mountain, Route } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';

/**
 * The map's DOM markers.
 *
 * MapLibre fires a map `click` for a click on a marker too, which in planner
 * mode would drop an unnamed waypoint underneath the place the user meant to
 * add. Each handler stops the native event at the marker so the map never
 * hears it. Keyboard activation goes through the inner element, which is what
 * carries the button role and the tab stop.
 */

type Coordinates = [number, number];

function activateOnKey(onActivate: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  };
}

function clickOnly(onActivate?: () => void) {
  if (!onActivate) return undefined;
  return (e: MarkerEvent<MouseEvent>) => {
    e.originalEvent.stopPropagation();
    onActivate();
  };
}

const dot = (size: number, color: string) => ({
  width: size,
  height: size,
  borderRadius: '50%',
  backgroundColor: color,
  border: '2.5px solid white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

interface PinMarkerProps {
  coordinates: Coordinates;
  color: string;
  icon: LucideIcon;
  label: string;
  title: string;
  onActivate?: () => void;
  /** Saved places are a smaller, filled pin so they read as a different thing. */
  small?: boolean;
}

/** A round icon on a short stem; the stem's tip sits on the coordinate. */
function PinMarker({
  coordinates,
  color,
  icon: Icon,
  label,
  title,
  onActivate,
  small = false,
}: PinMarkerProps) {
  const size = small ? 26 : 32;
  const stem = small ? 4 : 5;
  return (
    <Marker
      longitude={coordinates[0]}
      latitude={coordinates[1]}
      anchor="bottom"
      onClick={clickOnly(onActivate)}
    >
      <div
        role={onActivate ? 'button' : undefined}
        tabIndex={onActivate ? 0 : undefined}
        aria-label={onActivate ? label : undefined}
        title={title}
        onKeyDown={onActivate ? activateOnKey(onActivate) : undefined}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'pointer',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
        }}
      >
        <div style={dot(size, color)}>
          <Icon
            aria-hidden="true"
            size={small ? 12 : 15}
            color="white"
            fill={small ? 'white' : 'none'}
          />
        </div>
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: `${stem}px solid transparent`,
            borderRight: `${stem}px solid transparent`,
            borderTop: `${stem + 2}px solid ${color}`,
            marginTop: -1,
          }}
        />
      </div>
    </Marker>
  );
}

/** Advisory kinds that get the red pin rather than amber. */
const URGENT_ADVISORY_KINDS = new Set(['closure', 'emergency', 'rescue']);

export function AdvisoryMarker({
  coordinates,
  kind,
  title,
  onActivate,
}: {
  coordinates: Coordinates;
  kind: string;
  title: string;
  onActivate: () => void;
}) {
  return (
    <Marker longitude={coordinates[0]} latitude={coordinates[1]} onClick={clickOnly(onActivate)}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${kind}: ${title}`}
        title={title}
        onKeyDown={activateOnKey(onActivate)}
        style={{
          ...dot(28, URGENT_ADVISORY_KINDS.has(kind) ? '#e11d48' : '#f59e0b'),
          border: '2px solid white',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
        }}
      >
        <TriangleAlert aria-hidden="true" size={14} color="white" />
      </div>
    </Marker>
  );
}

export function WaypointMarker({
  coordinates,
  index,
  name,
}: {
  coordinates: Coordinates;
  index: number;
  name: string;
}) {
  return (
    <Marker longitude={coordinates[0]} latitude={coordinates[1]}>
      <div
        title={name}
        style={{
          ...dot(24, '#f97316'),
          border: '2px solid white',
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }}
      >
        {index + 1}
      </div>
    </Marker>
  );
}

/** The animated GPS pulse. Only ever drawn on a real device fix. */
export function UserLocationMarker({ coordinates }: { coordinates: Coordinates }) {
  const ring = (className: string, alpha: number) => (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        backgroundColor: `rgba(59,130,246,${alpha})`,
        transformOrigin: 'center',
      }}
    />
  );
  return (
    <Marker longitude={coordinates[0]} latitude={coordinates[1]} style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: 28, height: 28 }}>
        {ring('loc-ring', 0.45)}
        {ring('loc-ring-2', 0.3)}
        <div
          style={{
            position: 'absolute',
            inset: 5,
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            border: '2.5px solid white',
            boxShadow: '0 0 14px rgba(59,130,246,0.8), 0 2px 6px rgba(0,0,0,0.3)',
          }}
        />
      </div>
    </Marker>
  );
}

export function difficultyColor(difficulty: string): string {
  switch (difficulty.toLowerCase()) {
    case 'easy':
      return '#22c55e';
    case 'moderate':
      return '#f59e0b';
    case 'challenging':
      return '#ef4444';
    default:
      return '#3b82f6';
  }
}

function activityIcon(activityType: string): LucideIcon {
  switch (activityType.toLowerCase()) {
    case 'bike':
    case 'ride':
      return Bike;
    case 'rock_climb':
      return MountainIcon;
    case 'tour':
      return MapIcon;
    default:
      return Footprints;
  }
}

const hasCoordinates = (p: { coordinates?: unknown }): boolean =>
  Array.isArray(p.coordinates) &&
  p.coordinates.length === 2 &&
  typeof p.coordinates[0] === 'number' &&
  typeof p.coordinates[1] === 'number';

interface PlaceMarkersProps {
  /** Already filtered to the layers the user has switched on. */
  routes: Route[];
  mountains: Mountain[];
  campsites: Campsite[];
  savedPlaces: SavedPlace[];
  /**
   * Set while the planner is open. A click on a place then adds it by name,
   * which is far more useful than an unnamed dot and is what makes the
   * exported GPX readable.
   */
  onPlanClick?: (coordinates: [number, number], name: string) => void;
  onRouteClick?: (route: Route) => void;
  onMountainClick?: (mountain: Mountain) => void;
  onCampsiteClick?: (campsite: Campsite) => void;
}

/** Discovery and saved-place pins, in that stacking order. */
export function PlaceMarkers({
  routes,
  mountains,
  campsites,
  savedPlaces,
  onPlanClick,
  onRouteClick,
  onMountainClick,
  onCampsiteClick,
}: PlaceMarkersProps) {
  const pick = <T extends { coordinates: [number, number]; name: string }>(
    place: T,
    open?: (p: T) => void
  ) => (onPlanClick ? () => onPlanClick(place.coordinates, place.name) : () => open?.(place));

  return (
    <>
      {routes.filter(hasCoordinates).map((route) => (
        <PinMarker
          key={route.id}
          coordinates={route.coordinates}
          color={difficultyColor(route.difficulty)}
          icon={activityIcon(route.activity_type)}
          label={`${route.name}, ${route.difficulty} ${route.activity_type} route`}
          title={route.name}
          onActivate={pick(route, onRouteClick)}
        />
      ))}
      {mountains.filter(hasCoordinates).map((mountain) => (
        <PinMarker
          key={mountain.id}
          coordinates={mountain.coordinates}
          color="#78350f"
          icon={MountainIcon}
          label={
            mountain.elevation_m == null
              ? `${mountain.name}, elevation unknown`
              : `${mountain.name}, ${mountain.elevation_m} metres`
          }
          title={
            mountain.elevation_m == null
              ? mountain.name
              : `${mountain.name} (${mountain.elevation_m}m)`
          }
          onActivate={pick(mountain, onMountainClick)}
        />
      ))}
      {campsites.filter(hasCoordinates).map((campsite) => (
        <PinMarker
          key={campsite.id}
          coordinates={campsite.coordinates}
          color="#15803d"
          icon={Tent}
          label={`${campsite.name} campsite${campsite.rating ? `, rated ${campsite.rating} out of 5` : ''}`}
          title={`${campsite.name}${campsite.rating ? ` (★${campsite.rating})` : ''}`}
          onActivate={pick(campsite, onCampsiteClick)}
        />
      ))}
      {savedPlaces.filter(hasCoordinates).map((place) => (
        <PinMarker
          key={`saved-${place.id}`}
          coordinates={place.coordinates}
          color="#d97706"
          icon={Bookmark}
          label={`Saved: ${place.name}`}
          title={`Saved: ${place.name}`}
          small
        />
      ))}
    </>
  );
}
