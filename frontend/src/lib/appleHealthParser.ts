import { type Activity } from './activityTypes';

const HK_TYPE_MAP: Record<string, string> = {
  HKWorkoutActivityTypeRunning: 'Run',
  HKWorkoutActivityTypeCycling: 'Ride',
  HKWorkoutActivityTypeWalking: 'Walk',
  HKWorkoutActivityTypeHiking: 'Hike',
  HKWorkoutActivityTypeSwimming: 'Swim',
  HKWorkoutActivityTypeTraditionalStrengthTraining: 'WeightTraining',
  HKWorkoutActivityTypeYoga: 'Yoga',
  HKWorkoutActivityTypeCrossTraining: 'Crossfit',
  HKWorkoutActivityTypeFunctionalStrengthTraining: 'WeightTraining',
  HKWorkoutActivityTypeElliptical: 'Elliptical',
  HKWorkoutActivityTypeStairClimbing: 'StairStepper',
};

export interface AppleHealthWorkout {
  name: string;
  sport_type: string;
  start_date: string;
  distance_km: number;
  elevation_gain_m: number;
  moving_time_s: number;
  avg_heartrate?: number;
}

export function parseAppleHealthXml(xml: string): AppleHealthWorkout[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid Apple Health XML');

  const workouts = Array.from(doc.querySelectorAll('Workout'));
  if (workouts.length === 0) throw new Error('No workouts found in Apple Health export');

  const results: AppleHealthWorkout[] = [];

  for (const w of workouts) {
    const rawType = w.getAttribute('workoutActivityType') ?? '';
    const sport = HK_TYPE_MAP[rawType] ?? rawType.replace('HKWorkoutActivityType', '');
    const startDate = w.getAttribute('startDate') ?? new Date().toISOString();
    const durationMin = parseFloat(w.getAttribute('duration') ?? '0');

    // Distance — prefer metres, fall back to km
    const distEl =
      w.querySelector('WorkoutStatistics[type="HKQuantityTypeIdentifierDistanceWalkingRunning"]') ??
      w.querySelector('WorkoutStatistics[type="HKQuantityTypeIdentifierDistanceCycling"]');

    let distKm = 0;
    if (distEl) {
      const unit = distEl.getAttribute('unit') ?? '';
      const val = parseFloat(distEl.getAttribute('sum') ?? '0');
      distKm = unit === 'm' ? val / 1000 : val;
    } else {
      const rawDist = parseFloat(w.getAttribute('totalDistance') ?? '0');
      const rawUnit = w.getAttribute('totalDistanceUnit') ?? 'km';
      distKm = rawUnit === 'm' ? rawDist / 1000 : rawDist;
    }

    // Elevation — from WorkoutStatistics or route metadata
    const elevEl = w.querySelector(
      'WorkoutStatistics[type="HKQuantityTypeIdentifierFlightsClimbed"]'
    );
    const elevGain = elevEl ? parseFloat(elevEl.getAttribute('sum') ?? '0') * 3 : 0; // flights × ~3m

    // Heart rate
    const hrEl = w.querySelector('WorkoutStatistics[type="HKQuantityTypeIdentifierHeartRate"]');
    const avgHR = hrEl ? parseFloat(hrEl.getAttribute('average') ?? '0') : undefined;

    const movingTimeSec = Math.round(durationMin * 60);
    const dateLabel = new Date(startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    results.push({
      name: `${sport} – ${dateLabel}`,
      sport_type: sport.toLowerCase(),
      start_date: startDate,
      distance_km: Math.round(distKm * 100) / 100,
      elevation_gain_m: Math.round(elevGain),
      moving_time_s: movingTimeSec,
      avg_heartrate: avgHR && avgHR > 0 ? Math.round(avgHR) : undefined,
    });
  }

  return results;
}

export function appleHealthWorkoutsToActivities(
  workouts: AppleHealthWorkout[],
  fileHint: string
): Activity[] {
  return workouts.map((w, i) => ({
    id: `apple_${fileHint}_${w.start_date}_${i}`,
    source: 'apple_health' as Activity['source'],
    name: w.name,
    sport_type: w.sport_type,
    start_date: w.start_date,
    distance_km: w.distance_km,
    elevation_gain_m: w.elevation_gain_m,
    moving_time_s: w.moving_time_s,
    avg_heartrate: w.avg_heartrate,
  }));
}
