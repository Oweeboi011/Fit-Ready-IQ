// Shared domain types for routes, mountains, and campsites surfaced from Google Places.

import type { Difficulty } from '@/lib/routeDifficulty';

export interface Route {
  id: string;
  name: string;
  coordinates: [number, number];
  /**
   * Length of the trail itself. `null` whenever there is no trail geometry to
   * measure — which, for a Google Places result, is always. Never a distance
   * from the user: that is `distance_from_user_km`, computed per viewer.
   */
  distance_km: number | null;
  /**
   * Relief within ~900 m of the trailhead, not gain along the trail. `null`
   * when the Elevation API could not tell us. Never invent a value.
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
