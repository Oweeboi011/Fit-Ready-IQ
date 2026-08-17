import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ElevationProfile from './ElevationProfile';
import type { ElevationSample } from '@/lib/elevationProfile';

/**
 * The maths has its own tests; these cover what only rendering can reveal —
 * that the emitted SVG is well-formed, that each of the three empty states is
 * distinguishable, and that no path contains `NaN`.
 *
 * That last one is the reason this file exists. A NaN slipping into a `d`
 * attribute makes the browser drop the path silently, which looks exactly like
 * "this route is flat" and would never fail a unit test of the arithmetic.
 */

function samples(...pairs: [number, number | null][]): ElevationSample[] {
  return pairs.map(([distanceKm, elevationM]) => ({ distanceKm, elevationM }));
}

const CLIMB = samples([0, 100], [1, 180], [2, 140], [3, 320]);

/** Every `d` and coordinate attribute the chart emitted. */
function geometryAttributes(container: HTMLElement): string[] {
  const values: string[] = [];
  container.querySelectorAll('path, line, circle, text, rect').forEach((el) => {
    for (const name of ['d', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'width', 'height']) {
      const value = el.getAttribute(name);
      if (value != null) values.push(value);
    }
  });
  return values;
}

describe('ElevationProfile', () => {
  it('emits no NaN or Infinity in any geometry', () => {
    const { container } = render(<ElevationProfile samples={CLIMB} />);
    const bad = geometryAttributes(container).filter((v) => /NaN|Infinity/.test(v));
    expect(bad).toEqual([]);
  });

  it('stays finite for a dead-flat route, where the elevation range is zero', () => {
    // The division that would produce NaN if the range were not floored.
    const { container } = render(<ElevationProfile samples={samples([0, 200], [4, 200])} />);
    expect(geometryAttributes(container).filter((v) => /NaN/.test(v))).toEqual([]);
  });

  it('stays finite for a zero-length route', () => {
    const { container } = render(<ElevationProfile samples={samples([0, 100], [0, 120])} />);
    expect(geometryAttributes(container).filter((v) => /NaN/.test(v))).toEqual([]);
  });

  it('describes the profile to a screen reader, not just to the eye', () => {
    render(<ElevationProfile samples={CLIMB} />);
    const figure = screen.getByRole('img');
    // Identity is never colour-alone: the numbers are in the accessible name.
    expect(figure.getAttribute('aria-label')).toMatch(/ascent/i);
    expect(figure.getAttribute('aria-label')).toContain('320');
  });

  it('shows ascent and descent as direct labels', () => {
    render(<ElevationProfile samples={CLIMB} />);
    // 80 + 180 up, 40 down.
    expect(screen.getByText(/↑ 260 m/)).toBeDefined();
    expect(screen.getByText(/↓ 40 m/)).toBeDefined();
  });

  it('draws one path per contiguous run, so a gap is visibly broken', () => {
    const { container } = render(
      <ElevationProfile samples={samples([0, 100], [1, 120], [2, null], [3, 200], [4, 240])} />
    );
    // Two areas plus two lines.
    expect(container.querySelectorAll('path[d]').length).toBe(4);
  });

  it('admits when it only measured part of the route', () => {
    render(<ElevationProfile samples={samples([0, 100], [1, null], [2, 120], [3, 130])} />);
    expect(screen.getByText(/75% of route measured/)).toBeDefined();
  });

  it('says nothing about coverage when the profile is complete', () => {
    render(<ElevationProfile samples={CLIMB} />);
    expect(screen.queryByText(/of route measured/)).toBeNull();
  });

  describe('the three empty states stay distinguishable', () => {
    it('renders a placeholder while loading, with no chart', () => {
      const { container } = render(<ElevationProfile samples={[]} loading />);
      expect(container.querySelector('svg')).toBeNull();
      expect(container.querySelector('.skeleton')).not.toBeNull();
    });

    it('states the reason when the lookup failed', () => {
      render(<ElevationProfile samples={[]} error="Elevation data is unavailable." />);
      expect(screen.getByText('Elevation data is unavailable.')).toBeDefined();
    });

    it('says unavailable — never draws zeroes — when nothing is known', () => {
      render(<ElevationProfile samples={samples([0, null], [1, null])} />);
      expect(screen.getByText(/Elevation unavailable/)).toBeDefined();
    });
  });

  it('themes via CSS variables so it follows light and dark without a prop', () => {
    const { container } = render(<ElevationProfile samples={CLIMB} />);
    const stroke = container.querySelector('path[stroke]')?.getAttribute('stroke');
    expect(stroke).toBe('var(--chart-elevation-line)');
  });
});
