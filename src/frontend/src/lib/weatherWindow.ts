import {
  classifyHour,
  type ForecastHour,
  type WeatherAlert,
  type WeatherAlertSeverity,
  WEATHER_ALERT_LABELS,
} from './weatherAlerts';

/**
 * When should I go?
 *
 * ADR-0004 makes the point that current conditions at a mountain you are not
 * standing on, three days before you go, cannot answer the only weather
 * question a planner actually has. `weatherAlerts.ts` already says *whether*
 * something bad is coming; this says *when the good hours are*, which is the
 * part you can act on.
 *
 * A window is a property of a Route-and-forecast pairing, not of a location
 * (`CONTEXT.md`): the same forecast is a window for a two-hour valley walk and
 * a no-go for an eight-hour summit day, so the route's required duration is an
 * input rather than a constant.
 *
 * The honesty rules apply here as everywhere else. With no forecast the answer
 * is `unknown`, never an invented span. A `warning`-severity hour is
 * disqualifying rather than discounted — this is the one module in the app
 * whose output someone might use to decide to walk into a storm, so it errs
 * toward saying no.
 */

export type WeatherWindowStatus = 'clear' | 'marginal' | 'none' | 'unknown';

export interface WeatherWindow {
  status: WeatherWindowStatus;
  /** ISO timestamp of the first hour in the window, or null when there is none. */
  start: string | null;
  /** ISO timestamp of the last hour in the window, or null when there is none. */
  end: string | null;
  /** Length of the window in hours. `0` when there is none. */
  hours: number;
  /** Worst severity inside the window. `null` when the window is clear. */
  worst: WeatherAlertSeverity | null;
  /** One alert per hazard kind present inside the window, earliest first. */
  hazards: WeatherAlert[];
  /** One sentence, free of absolute times so the caller can format them. */
  summary: string;
}

/** Shortest outing worth planning around when a route gives no duration. */
export const MIN_WINDOW_HOURS = 3;

/** How far into the forecast to look. Beyond this an hourly forecast is noise. */
export const DEFAULT_SEARCH_HOURS = 48;

export interface WeatherWindowOptions {
  /** Hours the route needs. Rounded up; anything below 1 is treated as 1. */
  requiredHours?: number;
  /** How far ahead to search. */
  searchHours?: number;
}

interface Run {
  startIndex: number;
  endIndex: number;
  worst: WeatherAlertSeverity | null;
  alerts: WeatherAlert[];
}

function unknownWindow(summary: string): WeatherWindow {
  return { status: 'unknown', start: null, end: null, hours: 0, worst: null, hazards: [], summary };
}

/** One alert per kind, earliest first — the same collapsing `summarizeAlerts` does. */
function dedupeByKind(alerts: WeatherAlert[]): WeatherAlert[] {
  const byKind = new Map<string, WeatherAlert>();
  for (const alert of alerts) {
    const existing = byKind.get(alert.kind);
    const upgrades = existing && alert.severity === 'warning' && existing.severity === 'watch';
    if (!existing || upgrades) byKind.set(alert.kind, alert);
  }
  return Array.from(byKind.values()).sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}

function hazardList(alerts: WeatherAlert[]): string {
  const labels = Array.from(new Set(alerts.map((a) => WEATHER_ALERT_LABELS[a.kind].toLowerCase())));
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * Split the forecast into maximal runs of hours the predicate accepts.
 *
 * Two passes over the same forecast are needed rather than one. A run of hours
 * that merely carry no *warning* can contain a shorter, fully clear stretch
 * inside it, and that stretch is the better answer — collapsing both into a
 * single "not blocked" run would hide it and report a windy morning as the
 * best the week has to offer.
 */
function findRuns(hours: ForecastHour[], accepts: (alerts: WeatherAlert[]) => boolean): Run[] {
  const runs: Run[] = [];
  let open = false;

  for (let index = 0; index < hours.length; index += 1) {
    const alerts = classifyHour(hours[index]);

    if (!accepts(alerts)) {
      open = false;
      continue;
    }

    if (!open) {
      runs.push({ startIndex: index, endIndex: index, worst: null, alerts: [] });
      open = true;
    }

    const current = runs[runs.length - 1];
    current.endIndex = index;
    if (alerts.length > 0) {
      current.alerts.push(...alerts);
      current.worst = 'watch';
    }
  }

  return runs;
}

const isClear = (alerts: WeatherAlert[]) => alerts.length === 0;
const isPassable = (alerts: WeatherAlert[]) => !alerts.some((a) => a.severity === 'warning');

function runLength(run: Run): number {
  return run.endIndex - run.startIndex + 1;
}

function toWindow(run: Run, hours: ForecastHour[], status: 'clear' | 'marginal'): WeatherWindow {
  const hazards = dedupeByKind(run.alerts);
  const length = runLength(run);
  const summary =
    status === 'clear'
      ? `${length} clear ${length === 1 ? 'hour' : 'hours'} in the forecast.`
      : `${length} ${length === 1 ? 'hour' : 'hours'} with ${hazardList(hazards)} — passable, but not clear.`;

  return {
    status,
    start: hours[run.startIndex].at,
    end: hours[run.endIndex].at,
    hours: length,
    worst: run.worst,
    hazards,
    summary,
  };
}

/**
 * The soonest span worth going, or an honest reason there is not one.
 *
 * Earliest-qualifying rather than best-overall: "you could go at 6am tomorrow"
 * is actionable in a way that "the finest conditions are on Thursday" is not
 * when someone is deciding about this weekend. A fully clear run always wins
 * over an earlier marginal one, since the marginal answer is only useful when
 * there is no clear one.
 */
export function findWeatherWindow(
  hours: ForecastHour[],
  options: WeatherWindowOptions = {}
): WeatherWindow {
  const required = Math.max(1, Math.ceil(options.requiredHours ?? MIN_WINDOW_HOURS));
  const searchHours = options.searchHours ?? DEFAULT_SEARCH_HOURS;
  const relevant = hours.slice(0, searchHours);

  if (relevant.length === 0) {
    return unknownWindow('No forecast available for this route.');
  }

  if (relevant.length < required) {
    return unknownWindow(
      `The forecast does not reach far enough to cover the ${required} hours this route needs.`
    );
  }

  const clear = findRuns(relevant, isClear).find((run) => runLength(run) >= required);
  if (clear) return toWindow(clear, relevant, 'clear');

  const passable = findRuns(relevant, isPassable);
  const marginal = passable.find((run) => runLength(run) >= required);
  if (marginal) return toWindow(marginal, relevant, 'marginal');

  // Nothing long enough. Say which — a forecast that is entirely blocked is a
  // different answer from one whose good stretches are merely too short.
  const longest = passable.reduce<Run | null>(
    (best, run) => (best === null || runLength(run) > runLength(best) ? run : best),
    null
  );

  const blocking = dedupeByKind(
    relevant.flatMap((hour) => classifyHour(hour).filter((a) => a.severity === 'warning'))
  );

  const summary =
    longest === null
      ? `No hour in the forecast is free of ${hazardList(blocking) || 'a warning'}.`
      : `The longest safe stretch is ${runLength(longest)} ${
          runLength(longest) === 1 ? 'hour' : 'hours'
        }, short of the ${required} this route needs.`;

  return {
    status: 'none',
    start: null,
    end: null,
    hours: 0,
    worst: 'warning',
    hazards: blocking,
    summary,
  };
}
