import { describe, expect, it } from 'vitest';

import { classifyHour, summarizeAlerts, type ForecastHour } from './weatherAlerts';

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

describe('classifyHour', () => {
  it('returns nothing for a calm, dry, mild hour', () => {
    expect(classifyHour(hour('2026-08-10T09:00:00Z'))).toEqual([]);
  });

  it('flags a wind warning above the warning threshold, not below it', () => {
    const warning = classifyHour(hour('t', { windKph: 61 }));
    expect(warning).toHaveLength(1);
    expect(warning[0]).toMatchObject({ kind: 'high-wind', severity: 'warning' });

    const watch = classifyHour(hour('t', { windKph: 45 }));
    expect(watch[0]).toMatchObject({ kind: 'high-wind', severity: 'watch' });

    expect(classifyHour(hour('t', { windKph: 39 }))).toEqual([]);
  });

  it('flags heavy rain from either volume or a high probability', () => {
    expect(classifyHour(hour('t', { precipMm: 9 }))[0]).toMatchObject({
      kind: 'heavy-rain',
      severity: 'warning',
    });
    expect(classifyHour(hour('t', { precipProbabilityPct: 80 }))[0]).toMatchObject({
      kind: 'heavy-rain',
      severity: 'watch',
    });
  });

  it('flags storm risk from thunderstorm probability', () => {
    expect(classifyHour(hour('t', { thunderstormProbabilityPct: 55 }))[0]).toMatchObject({
      kind: 'storm',
      severity: 'warning',
    });
    expect(classifyHour(hour('t', { thunderstormProbabilityPct: 30 }))[0]).toMatchObject({
      kind: 'storm',
      severity: 'watch',
    });
  });

  it('flags extreme cold and extreme heat, and treats a missing temperature as no signal', () => {
    expect(classifyHour(hour('t', { tempC: -12 }))[0]).toMatchObject({ kind: 'extreme-cold' });
    expect(classifyHour(hour('t', { tempC: 38 }))[0]).toMatchObject({ kind: 'extreme-heat' });
    expect(classifyHour(hour('t', { tempC: null }))).toEqual([]);
  });

  it('can report more than one hazard for the same hour', () => {
    const alerts = classifyHour(hour('t', { windKph: 65, thunderstormProbabilityPct: 60 }));
    expect(alerts.map((a) => a.kind).sort()).toEqual(['high-wind', 'storm']);
  });
});

describe('summarizeAlerts', () => {
  it('returns nothing for a clean window', () => {
    const hours = Array.from({ length: 10 }, (_, i) => hour(`h${i}`));
    expect(summarizeAlerts(hours)).toEqual([]);
  });

  it('collapses repeated hazards to one entry, keeping the earliest onset', () => {
    const hours = [
      hour('t0', { windKph: 10 }),
      hour('t1', { windKph: 45 }),
      hour('t2', { windKph: 50 }),
      hour('t3', { windKph: 20 }),
    ];
    const alerts = summarizeAlerts(hours);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'high-wind', at: 't1' });
  });

  it('upgrades a watch to a warning if a later hour is worse, without losing the earliest onset time', () => {
    const hours = [hour('t0', { windKph: 45 }), hour('t1', { windKph: 65 })];
    const alerts = summarizeAlerts(hours);
    expect(alerts[0]).toMatchObject({ kind: 'high-wind', severity: 'warning', at: 't1' });
  });

  it('does not let a later warning downgrade back to a watch', () => {
    const hours = [hour('t0', { windKph: 65 }), hour('t1', { windKph: 45 })];
    const alerts = summarizeAlerts(hours);
    expect(alerts[0]).toMatchObject({ severity: 'warning', at: 't0' });
  });

  it('ignores hours past the window', () => {
    const hours = [hour('t0', { windKph: 10 }), hour('t1', { windKph: 65 })];
    expect(summarizeAlerts(hours, 1)).toEqual([]);
  });

  it('sorts multiple hazards by onset time', () => {
    const hours = [hour('t0', { thunderstormProbabilityPct: 60 }), hour('t1', { windKph: 65 })];
    const alerts = summarizeAlerts(hours);
    expect(alerts.map((a) => a.kind)).toEqual(['storm', 'high-wind']);
  });
});
