import type { DetailsData } from '@/components/DetailsModal';
import type { Activity } from '@/lib/activityTypes';
import type { Route, Mountain, Campsite } from '@/lib/placesTypes';

export type SelectedDetails =
  | { type: 'route'; data: Route }
  | { type: 'mountain'; data: Mountain }
  | { type: 'campsite'; data: Campsite }
  | { type: 'activity'; data: Activity }
  | null;

// Maps the page's selected-item state to DetailsModal's discriminated `data` prop shape.
export function toDetailsModalData(selectedDetails: SelectedDetails): DetailsData | null {
  if (!selectedDetails) return null;

  switch (selectedDetails.type) {
    case 'route':
      return {
        type: 'route' as const,
        id: selectedDetails.data.id,
        name: selectedDetails.data.name,
        coordinates: selectedDetails.data.coordinates,
        distance_km: selectedDetails.data.distance_km,
        elevation_gain_m: selectedDetails.data.elevation_gain_m,
        difficulty: selectedDetails.data.difficulty,
        activity_type: selectedDetails.data.activity_type,
        photos: selectedDetails.data.photos,
        place_id: selectedDetails.data.place_id,
        jumpoff_elevation: selectedDetails.data.jumpoff_elevation,
        summit_elevation: selectedDetails.data.summit_elevation,
        strava_segment: selectedDetails.data.strava_segment,
      };
    case 'mountain':
      return {
        type: 'mountain' as const,
        id: selectedDetails.data.id,
        name: selectedDetails.data.name,
        coordinates: selectedDetails.data.coordinates,
        elevation_m: selectedDetails.data.elevation_m,
        prominence_m: selectedDetails.data.prominence_m || 0,
        mountain_type: selectedDetails.data.mountain_type || 'peak',
        jumpoff_elevation: selectedDetails.data.jumpoff_elevation,
        summit_elevation: selectedDetails.data.summit_elevation,
        photos: selectedDetails.data.photos,
        place_id: selectedDetails.data.place_id,
        strava_segment: selectedDetails.data.strava_segment,
      };
    case 'campsite':
      return {
        type: 'campsite' as const,
        id: selectedDetails.data.id,
        name: selectedDetails.data.name,
        coordinates: selectedDetails.data.coordinates,
        campsite_type: selectedDetails.data.type || 'campsite',
        rating: selectedDetails.data.rating,
        amenities: selectedDetails.data.amenities || [],
        photos: selectedDetails.data.photos,
        place_id: selectedDetails.data.place_id,
      };
    case 'activity':
      return {
        type: 'activity' as const,
        id: selectedDetails.data.id,
        name: selectedDetails.data.name,
        source: selectedDetails.data.source,
        sport_type: selectedDetails.data.sport_type,
        start_date: selectedDetails.data.start_date,
        distance_km: selectedDetails.data.distance_km,
        elevation_gain_m: selectedDetails.data.elevation_gain_m,
        moving_time_s: selectedDetails.data.moving_time_s,
        avg_heartrate: selectedDetails.data.avg_heartrate,
        max_heartrate: selectedDetails.data.max_heartrate,
        external_id: selectedDetails.data.external_id,
        coordinates: selectedDetails.data.start_latlng,
      };
    default:
      return null;
  }
}
