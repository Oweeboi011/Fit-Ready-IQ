import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FALLBACK_LOCATION,
  LAST_LOCATION_KEY,
  locationProblemMessage,
  useUserLocation,
} from './useUserLocation';

/** Mirrors the numeric codes on the real GeolocationPositionError. */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

function positionError(code: number): GeolocationPositionError {
  return {
    code,
    message: '',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

function coords(lat: number, lng: number): GeolocationPosition {
  return {
    coords: { latitude: lat, longitude: lng } as GeolocationCoordinates,
    timestamp: Date.now(),
  } as GeolocationPosition;
}

let getCurrentPosition: ReturnType<typeof vi.fn>;

/** Resolve the pending geolocation request with a fix. */
function grant(lat: number, lng: number) {
  const [onSuccess] = getCurrentPosition.mock.calls.at(-1) ?? [];
  act(() => onSuccess(coords(lat, lng)));
}

/** Reject the pending geolocation request. */
function refuse(code: number) {
  const [, onError] = getCurrentPosition.mock.calls.at(-1) ?? [];
  act(() => onError(positionError(code)));
}

beforeEach(() => {
  localStorage.clear();
  getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUserLocation', () => {
  it('reports a live fix as precise and remembers it', async () => {
    const { result } = renderHook(() => useUserLocation());

    grant(14.6, 120.98);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.location).toEqual({ lat: 14.6, lng: 120.98 });
    expect(result.current.source).toBe('gps');
    expect(result.current.isPrecise).toBe(true);
    expect(result.current.problem).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) ?? '{}')).toEqual({
      lat: 14.6,
      lng: 120.98,
    });
  });

  it('passes a timeout to getCurrentPosition so a stalled prompt cannot hang forever', () => {
    renderHook(() => useUserLocation());

    const options = getCurrentPosition.mock.calls[0][2] as PositionOptions;
    expect(options.timeout).toBeGreaterThan(0);
  });

  it('falls back when permission is denied, and never calls the fallback precise', async () => {
    const { result } = renderHook(() => useUserLocation());

    refuse(PERMISSION_DENIED);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.location).toEqual(FALLBACK_LOCATION);
    expect(result.current.source).toBe('fallback');
    expect(result.current.isPrecise).toBe(false);
    expect(result.current.problem).toBe('denied');
  });

  it.each([
    [TIMEOUT, 'timeout'],
    [POSITION_UNAVAILABLE, 'unavailable'],
  ])('maps error code %i to problem %s', async (code, expected) => {
    const { result } = renderHook(() => useUserLocation());

    refuse(code);

    await waitFor(() => expect(result.current.problem).toBe(expected));
  });

  it('paints a stored location immediately and keeps it when the fix fails', async () => {
    const stored = { lat: 51.5, lng: -0.12, address: 'London' };
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useUserLocation());

    await waitFor(() => expect(result.current.location).toEqual(stored));
    expect(result.current.source).toBe('restored');
    // A restored location is a real place the user has been, but it is not a
    // current fix, so it must not light up the "Your Location" marker.
    expect(result.current.isPrecise).toBe(false);

    refuse(PERMISSION_DENIED);

    await waitFor(() => expect(result.current.problem).toBe('denied'));
    expect(result.current.location).toEqual(stored);
    expect(result.current.source).toBe('restored');
  });

  it('upgrades a stored location once a live fix arrives', async () => {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ lat: 51.5, lng: -0.12 }));

    const { result } = renderHook(() => useUserLocation());
    await waitFor(() => expect(result.current.source).toBe('restored'));

    grant(48.85, 2.35);

    await waitFor(() => expect(result.current.source).toBe('gps'));
    expect(result.current.location).toEqual({ lat: 48.85, lng: 2.35 });
  });

  it('ignores a malformed stored location', async () => {
    localStorage.setItem(LAST_LOCATION_KEY, '{"lat":"not-a-number"}');

    const { result } = renderHook(() => useUserLocation());
    refuse(PERMISSION_DENIED);

    await waitFor(() => expect(result.current.source).toBe('fallback'));
  });

  it('attaching an address to a fallback does not promote it to a real fix', async () => {
    const { result } = renderHook(() => useUserLocation());
    refuse(PERMISSION_DENIED);
    await waitFor(() => expect(result.current.source).toBe('fallback'));

    act(() => {
      result.current.setLocation({ ...FALLBACK_LOCATION, address: 'Somewhere, CA' }, 'fallback');
    });

    expect(result.current.isPrecise).toBe(false);
    // The notice must survive, or the user is told nothing went wrong.
    expect(result.current.problem).toBe('denied');
  });

  it('retry asks for the position again and can succeed', async () => {
    const { result } = renderHook(() => useUserLocation());
    refuse(PERMISSION_DENIED);
    await waitFor(() => expect(result.current.problem).toBe('denied'));

    act(() => result.current.retry());
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(2));

    grant(1, 2);

    await waitFor(() => expect(result.current.isPrecise).toBe(true));
    expect(result.current.problem).toBeNull();
  });

  it('falls back when the browser has no geolocation at all', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });

    const { result } = renderHook(() => useUserLocation());

    await waitFor(() => expect(result.current.problem).toBe('unsupported'));
    expect(result.current.source).toBe('fallback');
  });

  it('survives a browser that refuses to write localStorage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useUserLocation());
    grant(10, 20);

    await waitFor(() => expect(result.current.isPrecise).toBe(true));
    expect(result.current.location).toEqual({ lat: 10, lng: 20 });
  });
});

describe('locationProblemMessage', () => {
  it('names the fallback area so the user knows where results came from', () => {
    const message = locationProblemMessage('denied', 'fallback');
    expect(message).toContain(FALLBACK_LOCATION.address as string);
  });

  it('refers to the last known area when one was restored', () => {
    expect(locationProblemMessage('timeout', 'restored')).toContain('last known area');
  });

  it.each(['denied', 'timeout', 'unsupported', 'unavailable'] as const)(
    'gives %s a message with no developer instructions',
    (problem) => {
      const message = locationProblemMessage(problem, 'fallback');
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/console|env|API key|\.env/i);
    }
  );
});
