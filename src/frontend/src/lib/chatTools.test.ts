import { describe, expect, it, vi } from 'vitest';

import {
  TOOL_DECLARATIONS,
  parseChatContext,
  placeFacts,
  runTool,
  savedPlaceFor,
  type ChatContext,
  type OpenPlace,
} from './chatTools';

const route: OpenPlace = {
  kind: 'route',
  place: {
    id: 'wmt-hiking-1',
    name: 'Swiss Tour Monte Rosa',
    coordinates: [7.84, 46.11],
    distance_km: 55.9,
    elevation_gain_m: 4000,
    difficulty: 'challenging',
    activity_type: 'hike',
    place_id: 'osm:relation/1',
    photos: [],
  },
};

const peak: OpenPlace = {
  kind: 'mountain',
  place: {
    id: 'osm-node-2',
    name: 'Matterhorn',
    coordinates: [7.6586, 45.9764],
    elevation_m: null,
    mountain_type: 'peak',
  },
};

const camp: OpenPlace = {
  kind: 'campsite',
  place: {
    id: 'osm-way-3',
    name: 'Camping Zermatt',
    coordinates: [7.75, 46.03],
    type: 'campground',
    amenities: ['Toilets'],
  },
};

const ctx = (openPlace: OpenPlace | null, location: [number, number] | null = null) =>
  ({ openPlace, location }) satisfies ChatContext;

const noWeather = { weather: vi.fn() };

describe('parseChatContext', () => {
  it('keeps a well-formed open place and location', () => {
    const parsed = parseChatContext({ openPlace: route, location: [7.7, 46] });
    expect(parsed.openPlace?.place.name).toBe('Swiss Tour Monte Rosa');
    expect(parsed.location).toEqual([7.7, 46]);
  });

  it('drops a place that would not pass the cache schema', () => {
    const forged = { kind: 'route', place: { ...route.place, distance_km: -1 } };
    expect(parseChatContext({ openPlace: forged }).openPlace).toBeNull();
  });

  it('drops an unknown kind, an activity included', () => {
    expect(parseChatContext({ openPlace: { kind: 'activity', place: {} } }).openPlace).toBeNull();
  });

  it('drops an impossible location and tolerates no context at all', () => {
    expect(parseChatContext({ location: [200, 0] }).location).toBeNull();
    expect(parseChatContext(undefined)).toEqual({ openPlace: null, location: null });
  });
});

describe('placeFacts', () => {
  it('reports a measured route with its climb time', () => {
    expect(placeFacts(route)).toMatchObject({
      kind: 'route',
      length_km: 55.9,
      climb_m: 4000,
      difficulty: 'Challenging',
      unknown: [],
    });
    expect(placeFacts(route).climb_time_hours).not.toBeNull();
  });

  it('names every unknown rather than leaving it out', () => {
    const bare: OpenPlace = {
      kind: 'route',
      place: { ...route.place, distance_km: null, elevation_gain_m: null, difficulty: 'unknown' },
    };
    expect(placeFacts(bare)).toMatchObject({
      length_km: null,
      climb_m: null,
      climb_time_hours: null,
      unknown: ['length', 'climb', 'climb time', 'difficulty'],
    });
  });

  it('says a peak has no trail facts, and when its height is unknown', () => {
    expect(placeFacts(peak).unknown).toEqual([
      'summit height',
      'trail length',
      'climb from the trailhead',
    ]);
  });

  it('lists a campsite’s tagged amenities, or says they are unknown', () => {
    expect(placeFacts(camp)).toMatchObject({ amenities: ['Toilets'], unknown: [] });
    const untagged: OpenPlace = { kind: 'campsite', place: { ...camp.place, amenities: [] } };
    expect(placeFacts(untagged)).toMatchObject({ amenities: null, unknown: ['amenities'] });
  });
});

describe('runTool', () => {
  it('declares exactly the tools it runs', () => {
    expect(TOOL_DECLARATIONS.map((d) => d.name)).toEqual([
      'analyze_open_place',
      'analyze_weather',
      'propose_save_open_place',
    ]);
  });

  it('asks for a place when nothing is open', async () => {
    const out = await runTool('analyze_open_place', {}, ctx(null), noWeather);
    expect(out.response.error).toBe('nothing_open');
  });

  it('checks weather at the open place, scoped to the outing', async () => {
    const weather = vi.fn().mockResolvedValue({ condition: 'CLEAR' });
    const out = await runTool('analyze_weather', { hours: 7.6 }, ctx(route), { weather });
    expect(weather).toHaveBeenCalledWith(46.11, 7.84, 8);
    expect(out.response).toEqual({ at: 'Swiss Tour Monte Rosa', report: { condition: 'CLEAR' } });
  });

  it("falls back to the user's location, and ignores a silly duration", async () => {
    const weather = vi.fn().mockResolvedValue({});
    await runTool('analyze_weather', { hours: 9999 }, ctx(null, [7.7, 46]), { weather });
    expect(weather).toHaveBeenCalledWith(46, 7.7, null);
  });

  it('reports a weather failure instead of throwing', async () => {
    const weather = vi.fn().mockRejectedValue(new Error('down'));
    const out = await runTool('analyze_weather', {}, ctx(route), { weather });
    expect(out.response.error).toBe('weather_unavailable');
  });

  it('cannot check weather with nowhere to check it', async () => {
    const out = await runTool('analyze_weather', {}, ctx(null), noWeather);
    expect(out.response.error).toBe('no_location');
    expect(noWeather.weather).not.toHaveBeenCalled();
  });

  it('proposes a save without making one', async () => {
    const out = await runTool('propose_save_open_place', {}, ctx(peak), noWeather);
    expect(out.proposal).toEqual({
      action: 'save_place',
      placeId: 'osm-node-2',
      name: 'Matterhorn',
    });
    expect(out.response.status).toBe('awaiting_confirmation');
  });

  it('proposes nothing when nothing is open', async () => {
    const out = await runTool('propose_save_open_place', {}, ctx(null), noWeather);
    expect(out.proposal).toBeUndefined();
  });

  it('answers an unknown tool without throwing', async () => {
    const out = await runTool('delete_everything', {}, ctx(route), noWeather);
    expect(out.response.error).toBe('unknown_tool');
  });
});

describe('savedPlaceFor', () => {
  it('builds the same record the bookmark button does, per kind', () => {
    expect(savedPlaceFor(route)).toMatchObject({
      id: 'wmt-hiking-1',
      type: 'route',
      distance_km: 55.9,
      elevation_gain_m: 4000,
      difficulty: 'challenging',
    });
    expect(savedPlaceFor(peak)).toMatchObject({ type: 'mountain', elevation_m: undefined });
    expect(savedPlaceFor(camp)).toMatchObject({ type: 'campsite', name: 'Camping Zermatt' });
  });
});
