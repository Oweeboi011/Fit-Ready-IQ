// Discriminated union describing whatever is currently selected for the
// details modal. Lives in lib/ (not the component) so other lib modules
// (e.g. detailsModalMapper.ts) can depend on the shape without lib/ reaching
// back into components/ — see the lib-is-innermost dependency-cruiser rule.

import type { Difficulty } from '@/lib/routeDifficulty';

export interface RouteDetails {
  type: 'route';
  id: string;
  name: string;
  coordinates: [number, number];
  distance_km: number;
  elevation_gain_m: number | null;
  difficulty: Difficulty;
  activity_type: string;
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

export interface MountainDetails {
  type: 'mountain';
  id: string;
  name: string;
  coordinates: [number, number];
  elevation_m: number | null;
  prominence_m: number;
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

export interface CampsiteDetails {
  type: 'campsite';
  id: string;
  name: string;
  coordinates: [number, number];
  campsite_type: string;
  rating?: number;
  amenities?: string[];
  photos?: string[];
  place_id?: string;
}

export interface ActivityDetails {
  type: 'activity';
  id: string;
  name: string;
  source: 'strava' | 'coros' | 'garmin' | 'komoot' | 'apple_health';
  sport_type: string;
  start_date: string;
  distance_km: number;
  elevation_gain_m: number;
  moving_time_s: number;
  avg_heartrate?: number;
  max_heartrate?: number;
  coordinates?: [number, number];
  external_id?: string;
}

export type DetailsData = RouteDetails | MountainDetails | CampsiteDetails | ActivityDetails;
