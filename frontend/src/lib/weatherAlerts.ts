/**
 * Turns an hourly forecast into a short list of forward-looking hazards —
 * storm, heavy rain, high wind, temperature extremes — rather than the
 * current-conditions snapshot `/api/weather` already reports.
 *
 * Thresholds are the standard mountain-hiking rules of thumb, not a
 * meteorological service's official warning levels — this app has no
 * authority to issue those. A "watch" is a rising risk worth noting; a
 * "warning" is a threshold serious enough to reconsider going out.
 */

export type WeatherAlertKind =
  'storm' | 'heavy-rain' | 'high-wind' | 'extreme-cold' | 'extreme-heat';

export type WeatherAlertSeverity = 'watch' | 'warning';

export interface WeatherAlert {
  kind: WeatherAlertKind;
  severity: WeatherAlertSeverity;
  /** ISO timestamp of the forecast hour that triggered this alert. */
  at: string;
  /** One short, human-readable line, e.g. "Wind near 65 kph". */
  summary: string;
}

export interface ForecastHour {
  at: string;
  windKph: number;
  precipMm: number;
  precipProbabilityPct: number;
  thunderstormProbabilityPct: number;
  tempC: number | null;
}

const HIGH_WIND_WARNING_KPH = 60;
const HIGH_WIND_WATCH_KPH = 40;
const HEAVY_RAIN_WARNING_MM = 8;
const HEAVY_RAIN_WATCH_MM = 4;
const HEAVY_RAIN_WATCH_PROBABILITY_PCT = 70;
const STORM_WARNING_PCT = 50;
const STORM_WATCH_PCT = 25;
const EXTREME_COLD_C = -10;
const EXTREME_HEAT_C = 35;

/** How far ahead a card badge or dock summary looks by default. */
export const DEFAULT_ALERT_WINDOW_HOURS = 48;

export const WEATHER_ALERT_LABELS: Record<WeatherAlertKind, string> = {
  storm: 'Storm risk',
  'heavy-rain': 'Heavy rain',
  'high-wind': 'High wind',
  'extreme-cold': 'Extreme cold',
  'extreme-heat': 'Extreme heat',
};

function windAlert(hour: ForecastHour): WeatherAlert | null {
  if (hour.windKph >= HIGH_WIND_WARNING_KPH) {
    return {
      kind: 'high-wind',
      severity: 'warning',
      at: hour.at,
      summary: `Wind near ${Math.round(hour.windKph)} kph`,
    };
  }
  if (hour.windKph >= HIGH_WIND_WATCH_KPH) {
    return {
      kind: 'high-wind',
      severity: 'watch',
      at: hour.at,
      summary: `Wind near ${Math.round(hour.windKph)} kph`,
    };
  }
  return null;
}

function rainAlert(hour: ForecastHour): WeatherAlert | null {
  if (hour.precipMm >= HEAVY_RAIN_WARNING_MM) {
    return {
      kind: 'heavy-rain',
      severity: 'warning',
      at: hour.at,
      summary: `${hour.precipMm.toFixed(0)} mm/h expected`,
    };
  }
  if (
    hour.precipMm >= HEAVY_RAIN_WATCH_MM ||
    hour.precipProbabilityPct >= HEAVY_RAIN_WATCH_PROBABILITY_PCT
  ) {
    return {
      kind: 'heavy-rain',
      severity: 'watch',
      at: hour.at,
      summary: `Rain likely (${Math.round(hour.precipProbabilityPct)}%)`,
    };
  }
  return null;
}

function stormAlert(hour: ForecastHour): WeatherAlert | null {
  if (hour.thunderstormProbabilityPct >= STORM_WARNING_PCT) {
    return {
      kind: 'storm',
      severity: 'warning',
      at: hour.at,
      summary: `Thunderstorm risk ${Math.round(hour.thunderstormProbabilityPct)}%`,
    };
  }
  if (hour.thunderstormProbabilityPct >= STORM_WATCH_PCT) {
    return {
      kind: 'storm',
      severity: 'watch',
      at: hour.at,
      summary: `Thunderstorm risk ${Math.round(hour.thunderstormProbabilityPct)}%`,
    };
  }
  return null;
}

function temperatureAlert(hour: ForecastHour): WeatherAlert | null {
  if (hour.tempC == null) return null;
  if (hour.tempC <= EXTREME_COLD_C) {
    return {
      kind: 'extreme-cold',
      severity: 'warning',
      at: hour.at,
      summary: `${Math.round(hour.tempC)}°C`,
    };
  }
  if (hour.tempC >= EXTREME_HEAT_C) {
    return {
      kind: 'extreme-heat',
      severity: 'warning',
      at: hour.at,
      summary: `${Math.round(hour.tempC)}°C`,
    };
  }
  return null;
}

/** Every hazard a single forecast hour crosses the threshold for. */
export function classifyHour(hour: ForecastHour): WeatherAlert[] {
  return [windAlert(hour), rainAlert(hour), stormAlert(hour), temperatureAlert(hour)].filter(
    (a): a is WeatherAlert => a !== null
  );
}

/**
 * Collapses a forecast window into one alert per hazard kind — the earliest
 * hour it appears, at its worst severity across the window. A card badge or
 * a dock summary wants "is there a storm coming", not one line per hour.
 */
export function summarizeAlerts(
  hours: ForecastHour[],
  windowHours: number = DEFAULT_ALERT_WINDOW_HOURS
): WeatherAlert[] {
  const relevant = hours.slice(0, windowHours);
  const byKind = new Map<WeatherAlertKind, WeatherAlert>();

  for (const hour of relevant) {
    for (const alert of classifyHour(hour)) {
      const existing = byKind.get(alert.kind);
      const upgrades = existing && alert.severity === 'warning' && existing.severity === 'watch';
      if (!existing || upgrades) {
        byKind.set(alert.kind, alert);
      }
    }
  }

  return Array.from(byKind.values()).sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}
