import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import RouteFilter, { DEFAULT_FILTERS, type FilterState } from './RouteFilter';

function renderFilter(filters: FilterState = DEFAULT_FILTERS) {
  const onFilterChange = vi.fn();
  render(<RouteFilter filters={filters} onFilterChange={onFilterChange} />);
  return onFilterChange;
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

// Controlled by the page: the panel unmounts when the tab changes, so any state
// it held itself would silently reset while the list stayed filtered.
describe('RouteFilter', () => {
  it('reflects the filters it is given rather than holding its own', () => {
    renderFilter({ ...DEFAULT_FILTERS, activityTypes: ['bike'] });
    expect(pressed('Bikepacking')).toBe('true');
    expect(pressed('Backpacking')).toBe('false');
  });

  it('reports a toggle upward without changing anything locally', () => {
    const onFilterChange = renderFilter();
    fireEvent.click(screen.getByRole('button', { name: 'Backpacking' }));
    expect(onFilterChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, activityTypes: ['hike'] });
    expect(pressed('Backpacking')).toBe('false');
  });

  it('toggles an active option off', () => {
    const onFilterChange = renderFilter({ ...DEFAULT_FILTERS, activityTypes: ['hike', 'bike'] });
    fireEvent.click(screen.getByRole('button', { name: 'Backpacking' }));
    expect(onFilterChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, activityTypes: ['bike'] });
  });

  it('toggles difficulty bands, including the unrated one', () => {
    const onFilterChange = renderFilter({ ...DEFAULT_FILTERS, difficulty: ['easy'] });
    fireEvent.click(screen.getByRole('button', { name: 'Unrated' }));
    expect(onFilterChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      difficulty: ['easy', 'unknown'],
    });
  });

  it('hides the range controls until expanded, then reports each change', () => {
    const onFilterChange = renderFilter();
    expect(screen.queryByLabelText('Maximum distance from you')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    fireEvent.change(screen.getByLabelText('Maximum distance from you'), {
      target: { value: '20' },
    });
    expect(onFilterChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, maxDistance: 20 });

    fireEvent.change(screen.getByLabelText('Minimum elevation gain'), {
      target: { value: '500' },
    });
    expect(onFilterChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, minElevation: 500 });

    fireEvent.change(screen.getByLabelText('Maximum elevation gain'), {
      target: { value: '1500' },
    });
    expect(onFilterChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, maxElevation: 1500 });
  });

  it('offers Reset only when something is active', () => {
    renderFilter();
    expect(screen.queryByRole('button', { name: /Reset/ })).toBeNull();
  });

  it('resets to the defaults', () => {
    const onFilterChange = renderFilter({ ...DEFAULT_FILTERS, difficulty: ['easy'] });
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    expect(onFilterChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
  });
});
