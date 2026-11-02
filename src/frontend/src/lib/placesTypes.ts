// Shared domain types for routes, mountains, and campsites discovered from OpenStreetMap.

import type { Difficulty } from '@/lib/routeDifficulty';

export interface Route {
  id: string;
  name: string;
  coordinates: [number, number];
  /**
   * Length of the trail itself, measured from its mapped OSM geometry. `null`
   * when there is no geometry — a climbing area, or a route Waymarked Trails
   * could not measure. Never a distance from the user: that is
   * `distance_from_user_km`, computed per viewer.
   */
  distance_km: number | null;
  /**
   * Total climb along the route, from the relation's own `ascent` tag. `null`
   * when the route has none, which is most of them. Never invent a value.
   */
  elevation_gain_m: number | null;
  difficulty: Difficulty;
  activity_type: string;
  polyline?: [number, number][];
  photos?: string[];
  place_id?: string;
  distance_from_user_km?: number;
  jumpoff_elevation?: number;
  summit_elevation?: number;
  /**
   * `generateStravaSegment` used to fabricate segment ids, KOM/QOM times and
   * effort counts from a hash of the place name and rendered them under
   * Strava branding — invented athletic records attributed to real athletes.
   * This field remains so genuine Strava segment data can populate it later;
   * nothing writes it today.
   */
  strava_segment?: {
    id: string;
    name: string;
    distance: number;
    avg_grade: number;
    kom_time?: string;
    qom_time?: string;
    total_efforts?: number;
  };
}

export interface Mountain {
  id: string;
  name: string;
  coordinates: [number, number];
  /** `null` when the Elevation API could not tell us. Never invent a value. */
  elevation_m: number | null;
  prominence_m?: number;
  trail_class?: string;
  mountain_type: string;
  photos?: string[];
  place_id?: string;
  jumpoff_elevation?: number;
  summit_elevation?: number;
  strava_segment?: {
    id: string;
    name: string;
    distance: number;
    avg_grade: number;
    kom_time?: string;
    qom_time?: string;
    total_efforts?: number;
  };
}

export interface Campsite {
  id: string;
  name: string;
  coordinates: [number, number];
  type: string;
  rating?: number;
  amenities?: string[];
  photos?: string[];
  place_id?: string;
}
