import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WeatherWindowPanel } from './WeatherWindowPanel';
import type { WeatherWindow } from '@/lib/weatherWindow';

/**
 * The window is a safety answer, so the panel must never look more certain than
 * the data: no forecast reads "unknown", not "clear", and a malformed timestamp
 * drops the span rather than printing "Invalid Date".
 */

const CLEAR: WeatherWindow = {
  status: 'clear',
  start: '2026-10-10T06:00:00Z',
  end: '2026-10-10T12:00:00Z',
  hours: 6,
  worst: null,
  hazards: [],
  summary: 'Six clear hours.',
};

describe('WeatherWindowPanel', () => {
  it('says the window is unknown when there is no forecast', () => {
    render(<WeatherWindowPanel window={null} />);
    expect(screen.getByText('Window unknown')).toBeInTheDocument();
    expect(screen.getByText('No forecast available for this route.')).toBeInTheDocument();
    expect(screen.queryByText(/Good window/)).not.toBeInTheDocument();
  });

  it('renders a clear window with its span and summary', () => {
    const { container } = render(<WeatherWindowPanel window={CLEAR} />);
    expect(screen.getByText('Good window')).toBeInTheDocument();
    expect(screen.getByText('Six clear hours.')).toBeInTheDocument();
    expect(container.textContent).toContain('→');
  });

  it('drops the span instead of printing an invalid date', () => {
    const { container } = render(<WeatherWindowPanel window={{ ...CLEAR, start: 'not-a-date' }} />);
    expect(container.textContent).not.toContain('Invalid Date');
    expect(container.textContent).not.toContain('→');
  });

  it('lists the hazards inside a window with none safe', () => {
    render(
      <WeatherWindowPanel
        window={{
          ...CLEAR,
          status: 'none',
          start: null,
          end: null,
          hours: 0,
          worst: 'warning',
          hazards: [
            {
              kind: 'high-wind',
              severity: 'warning',
              at: CLEAR.start!,
              summary: 'Wind near 65 kph',
            },
          ],
          summary: 'Wind all day.',
        }}
      />
    );
    expect(screen.getByText('No safe window')).toBeInTheDocument();
    expect(screen.getByText('Wind near 65 kph')).toBeInTheDocument();
  });
});
