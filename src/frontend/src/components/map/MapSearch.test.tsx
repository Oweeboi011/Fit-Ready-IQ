import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The search hook is mocked: it talks to the billable Places API, and what is
 * worth testing here is the panel's behaviour around the results — the keyboard
 * path, and that "Add" reaches the planner with the place's name.
 */
const state = {
  results: [] as {
    id: string;
    name: string;
    address: string | null;
    coordinates: [number, number];
  }[],
  loading: false,
  empty: false,
};
vi.mock('@/lib/usePlaceSearch', () => ({
  usePlaceSearch: () => state,
}));

import MapSearch from './MapSearch';

const NEAR: [number, number] = [121, 14];

const RESULTS = [
  {
    id: 'a',
    name: 'Mount Pulag',
    address: 'Benguet',
    coordinates: [120.9, 16.6] as [number, number],
  },
  { id: 'b', name: 'Mount Apo', address: 'Davao', coordinates: [125.2, 6.98] as [number, number] },
];

function setup(overrides: Partial<typeof state> = {}, plannerOpen = false) {
  Object.assign(state, { results: [], loading: false, empty: false }, overrides);
  const onGoTo = vi.fn();
  const onAddToPlan = vi.fn();
  render(
    <MapSearch near={NEAR} onGoTo={onGoTo} onAddToPlan={onAddToPlan} plannerOpen={plannerOpen} />
  );
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  return { input, onGoTo, onAddToPlan };
}

beforeEach(() => vi.clearAllMocks());

describe('MapSearch', () => {
  it('disables itself until a location is known, since results are biased to it', () => {
    Object.assign(state, { results: [], loading: false, empty: false });
    render(
      <MapSearch near={undefined} onGoTo={vi.fn()} onAddToPlan={vi.fn()} plannerOpen={false} />
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('lists the results with their addresses', () => {
    setup({ results: RESULTS });
    expect(screen.getByText('Mount Pulag')).toBeDefined();
    expect(screen.getByText('Benguet')).toBeDefined();
  });

  it('adds the place to the plan by name, which is what makes the GPX readable', () => {
    const { onAddToPlan } = setup({ results: RESULTS });
    fireEvent.click(screen.getByLabelText('Add Mount Pulag to your plan'));
    expect(onAddToPlan).toHaveBeenCalledWith([120.9, 16.6], 'Mount Pulag');
  });

  it('moves the map when a result is picked without adding it', () => {
    const { onGoTo, onAddToPlan } = setup({ results: RESULTS });
    fireEvent.click(screen.getByText('Mount Apo'));
    expect(onGoTo).toHaveBeenCalledWith([125.2, 6.98]);
    expect(onAddToPlan).not.toHaveBeenCalled();
  });

  it('walks the list with the arrow keys', () => {
    const { input } = setup({ results: RESULTS });
    const options = () => screen.getAllByRole('option');
    expect(options()[0].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options()[1].getAttribute('aria-selected')).toBe('true');

    // Wraps rather than sticking at the end.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options()[0].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('Enter adds to the plan while the planner is open', () => {
    const { input, onAddToPlan } = setup({ results: RESULTS }, true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddToPlan).toHaveBeenCalledWith([120.9, 16.6], 'Mount Pulag');
  });

  it('Enter only moves the map while the planner is closed', () => {
    const { input, onGoTo, onAddToPlan } = setup({ results: RESULTS }, false);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onGoTo).toHaveBeenCalled();
    expect(onAddToPlan).not.toHaveBeenCalled();
  });

  it('says when a search found nothing, rather than showing a blank panel', () => {
    const { input } = setup({ empty: true });
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(screen.getByText(/Nothing found/)).toBeDefined();
  });

  it('shows a searching state so the delay is explained', () => {
    setup({ loading: true });
    expect(screen.getByText('Searching…')).toBeDefined();
  });

  it('closes on Escape', () => {
    const { input } = setup({ results: RESULTS });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('keeps the panel open after adding, so a route can be built from several places', () => {
    setup({ results: RESULTS }, true);
    fireEvent.click(screen.getByLabelText('Add Mount Pulag to your plan'));
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});
