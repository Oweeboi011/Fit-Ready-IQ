import { describe, expect, it } from 'vitest';

import type { ForecastHour } from './weatherAlerts';
import { DEFAULT_SEARCH_HOURS, MIN_WINDOW_HOURS, findWeatherWindow } from './weatherWindow';

/** A calm, dry, mild hour — nothing in it crosses any threshold. */
function hour(at: string, over: Partial<ForecastHour> = {}): ForecastHour {
  return {
    at,
    windKph: 10,
    precipMm: 0,
    precipProbabilityPct: 0,
    thunderstormProbabilityPct: 0,
    tempC: 15,
    ...over,
  };
}

/** `count` consecutive hours starting at midnight on 2026-08-10. */
function series(count: number, over: (i: number) => Partial<ForecastHour> = () => ({})) {
  return Array.from({ length: count }, (_, i) =>
    hour(`2026-08-10T${String(i).padStart(2, '0')}:00:00Z`, over(i))
  );
}

const STORM = { thunderstormProbabilityPct: 80 } as const; // warning
const BREEZE = { windKph: 45 } as const; // watch

describe('findWeatherWindow', () => {
  it('reports unknown rather than inventing a span when there is no forecast', () => {
    const window = findWeatherWindow([]);
    expect(window.status).toBe('unknown');
    expect(window.start).toBeNull();
    expect(window.hours).toBe(0);
  });

  it('reports unknown when the forecast is shorter than the route needs', () => {
    const window = findWeatherWindow(series(2), { requiredHours: 6 });
    expect(window.status).toBe('unknown');
    expect(window.summary).toContain('does not reach far enough');
  });

  it('finds a fully clear window and reports its span', () => {
    const window = findWeatherWindow(series(8), { requiredHours: 4 });
    expect(window.status).toBe('clear');
    expect(window.start).toBe('2026-08-10T00:00:00Z');
    expect(window.end).toBe('2026-08-10T07:00:00Z');
    expect(window.hours).toBe(8);
    expect(window.worst).toBeNull();
    expect(window.hazards).toEqual([]);
  });

  it('treats a warning hour as disqualifying, never as part of a window', () => {
    // Storm at 02:00 splits the day into a 2-hour and a 5-hour run.
    const hours = series(8, (i) => (i === 2 ? STORM : {}));
    const window = findWeatherWindow(hours, { requiredHours: 4 });

    expect(window.status).toBe('clear');
    expect(window.start).toBe('2026-08-10T03:00:00Z');
    expect(window.hours).toBe(5);
  });

  it('prefers a later clear window over an earlier marginal one', () => {
    // 00:00-03:00 windy (watch), 04:00-07:00 clear.
    const hours = series(8, (i) => (i < 4 ? BREEZE : {}));
    const window = findWeatherWindow(hours, { requiredHours: 4 });

    expect(window.status).toBe('clear');
    expect(window.start).toBe('2026-08-10T04:00:00Z');
  });

  it('falls back to a marginal window and names the hazard', () => {
    const hours = series(6, () => BREEZE);
    const window = findWeatherWindow(hours, { requiredHours: 4 });

    expect(window.status).toBe('marginal');
    expect(window.worst).toBe('watch');
    expect(window.hazards.map((h) => h.kind)).toEqual(['high-wind']);
    expect(window.summary).toContain('high wind');
  });

  it('says no window exists when every hour carries a warning', () => {
    const window = findWeatherWindow(
      series(6, () => STORM),
      { requiredHours: 3 }
    );

    expect(window.status).toBe('none');
    expect(window.start).toBeNull();
    expect(window.hazards.map((h) => h.kind)).toEqual(['storm']);
    expect(window.summary).toContain('No hour in the forecast');
  });

  it('distinguishes "too short" from "entirely blocked"', () => {
    // Clear, storm, clear, storm… no run longer than one hour.
    const hours = series(8, (i) => (i % 2 === 1 ? STORM : {}));
    const window = findWeatherWindow(hours, { requiredHours: 4 });

    expect(window.status).toBe('none');
    expect(window.summary).toContain('longest safe stretch is 1 hour');
    expect(window.summary).toContain('short of the 4');
  });

  it('scales the answer to the route, not the location', () => {
    // One 3-hour clear run. A short walk fits; a long day does not.
    const hours = series(8, (i) => (i >= 3 ? STORM : {}));

    expect(findWeatherWindow(hours, { requiredHours: 3 }).status).toBe('clear');
    expect(findWeatherWindow(hours, { requiredHours: 6 }).status).toBe('none');
  });

  it('defaults to a short outing when the route gives no duration', () => {
    const hours = series(8, (i) => (i >= MIN_WINDOW_HOURS ? STORM : {}));
    expect(findWeatherWindow(hours).status).toBe('clear');
  });

  it('rounds a fractional duration up rather than down', () => {
    // Exactly 3 clear hours. A 3.2-hour route must not be told it fits.
    const hours = series(8, (i) => (i >= 3 ? STORM : {}));
    expect(findWeatherWindow(hours, { requiredHours: 3.2 }).status).toBe('none');
  });

  it('treats a non-positive duration as one hour rather than zero', () => {
    const window = findWeatherWindow(series(4), { requiredHours: 0 });
    expect(window.status).toBe('clear');
  });

  it('ignores hours beyond the search horizon', () => {
    // Clear only after the horizon; everything inside it is stormy.
    const hours = [...series(4, () => STORM), ...series(6)];
    const window = findWeatherWindow(hours, { requiredHours: 3, searchHours: 4 });
    expect(window.status).toBe('none');
  });

  it('searches two days ahead by default', () => {
    expect(DEFAULT_SEARCH_HOURS).toBe(48);
  });

  it('collapses repeated hazards to one entry per kind', () => {
    const hours = series(6, () => BREEZE);
    const window = findWeatherWindow(hours, { requiredHours: 4 });
    expect(window.hazards).toHaveLength(1);
  });
});
