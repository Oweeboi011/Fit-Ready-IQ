import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  recordWeatherAlerts,
  getWeatherAlertsNear,
  useWeatherAlertsNear,
} from './weatherAlertCache';
import type { WeatherAlert } from './weatherAlerts';

const stormAlert: WeatherAlert = {
  kind: 'storm',
  severity: 'warning',
  at: '2026-08-10T09:00:00Z',
  summary: 'Thunderstorm risk 60%',
};

// The store is module-level, so every test (across this whole file) uses
// coordinates far enough apart (grid cells are ~11 km) that none can collide
// with data another test already wrote.
let lat = 0;

function freshCoords(): [number, number] {
  lat += 5;
  return [lat, 0];
}

describe('weatherAlertCache', () => {
  it('returns nothing for a coordinate nobody has fetched', () => {
    const [testLat, testLng] = freshCoords();
    expect(getWeatherAlertsNear(testLat, testLng)).toEqual([]);
  });

  it('returns recorded alerts for the same coordinate', () => {
    const [testLat, testLng] = freshCoords();
    recordWeatherAlerts(testLat, testLng, [stormAlert]);
    expect(getWeatherAlertsNear(testLat, testLng)).toEqual([stormAlert]);
  });

  it('shares alerts across nearby coordinates in the same grid cell', () => {
    const [testLat, testLng] = freshCoords();
    recordWeatherAlerts(testLat, testLng, [stormAlert]);
    // 0.02 degrees is well inside the same ~0.1 degree grid cell.
    expect(getWeatherAlertsNear(testLat + 0.02, testLng + 0.02)).toEqual([stormAlert]);
  });

  it('does not leak alerts into a distant grid cell', () => {
    const [testLat, testLng] = freshCoords();
    recordWeatherAlerts(testLat, testLng, [stormAlert]);
    expect(getWeatherAlertsNear(testLat + 5, testLng)).toEqual([]);
  });

  it('useWeatherAlertsNear re-renders once a matching record arrives', () => {
    const [testLat, testLng] = freshCoords();
    const { result, rerender } = renderHook(() => useWeatherAlertsNear(testLat, testLng));
    expect(result.current).toEqual([]);

    recordWeatherAlerts(testLat, testLng, [stormAlert]);
    rerender();
    expect(result.current).toEqual([stormAlert]);
  });
});
