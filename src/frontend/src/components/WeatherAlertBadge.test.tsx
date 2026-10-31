import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WeatherAlertBadge, WeatherAlertChips } from './WeatherAlertBadge';
import type { WeatherAlert } from '@/lib/weatherAlerts';

/** The badge leads with the worst hazard: a warning must never hide behind a watch. */

const WATCH: WeatherAlert = {
  kind: 'heavy-rain',
  severity: 'watch',
  at: '2026-10-10T06:00:00Z',
  summary: 'Rain near 8 mm/h',
};
const WARNING: WeatherAlert = {
  kind: 'storm',
  severity: 'warning',
  at: '2026-10-10T09:00:00Z',
  summary: 'Thunderstorm',
};

describe('WeatherAlertBadge', () => {
  it('renders nothing without alerts', () => {
    const { container } = render(<WeatherAlertBadge alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leads with the warning even when a watch comes first', () => {
    render(<WeatherAlertBadge alerts={[WATCH, WARNING]} />);
    const badge = screen.getByText('Storm risk +1');
    expect(badge).toHaveAttribute(
      'title',
      'Heavy rain: Rain near 8 mm/h · Storm risk: Thunderstorm'
    );
  });

  it('shows a single alert without a count', () => {
    render(<WeatherAlertBadge alerts={[WATCH]} />);
    expect(screen.getByText('Heavy rain')).toBeInTheDocument();
  });
});

describe('WeatherAlertChips', () => {
  it('lists every alert with its summary', () => {
    render(<WeatherAlertChips alerts={[WATCH, WARNING]} />);
    expect(screen.getByText(/Heavy rain — Rain near 8 mm\/h/)).toBeInTheDocument();
    expect(screen.getByText(/Storm risk — Thunderstorm/)).toBeInTheDocument();
  });

  it('renders nothing without alerts', () => {
    const { container } = render(<WeatherAlertChips alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
