import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Trip } from '@/lib/trips';

import TripsModal from './TripsModal';

const store = vi.hoisted(() => ({
  trips: [] as Trip[],
  status: 'ready' as 'signed_out' | 'loading' | 'ready' | 'failed',
  writeError: null as string | null,
  create: vi.fn(),
  checkIn: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/useTrips', () => ({ useTrips: () => store }));

const HOUR = 3_600_000;
const target = {
  kind: 'mountain' as const,
  id: 'osm-node-1',
  name: 'Mt Pulag',
  coordinates: [120.88, 16.6] as [number, number],
};

beforeEach(() => {
  store.trips = [];
  store.status = 'ready';
  store.writeError = null;
  vi.clearAllMocks();
  store.create.mockResolvedValue(true);
});

describe('TripsModal', () => {
  it('says plainly that nobody is alerted', () => {
    render(<TripsModal isOpen onClose={() => {}} uid="u" draft={null} />);
    expect(screen.getByText(/does not alert anyone/)).toBeInTheDocument();
    expect(screen.getByText(/No trips yet/)).toBeInTheDocument();
  });

  it('saves a trip planned from a place, with the suggested return', async () => {
    render(
      <TripsModal isOpen onClose={() => {}} uid="u" draft={{ target, elevationGainM: 1800 }} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

    await waitFor(() => expect(store.create).toHaveBeenCalledTimes(1));
    const saved = store.create.mock.calls[0][0];
    expect(saved.target).toEqual(target);
    // 1 800 m of climb suggests eight hours.
    expect(saved.expectedReturnAt - saved.startAt).toBe(8 * HOUR);
    expect(await screen.findByText(/Trip to Mt Pulag saved/)).toBeInTheDocument();
  });

  it('refuses a return before the start and says why', () => {
    render(
      <TripsModal isOpen onClose={() => {}} uid="u" draft={{ target, elevationGainM: null }} />
    );
    fireEvent.change(screen.getByLabelText('Expected back'), {
      target: { value: '2020-01-01T08:00' },
    });
    expect(screen.getByText(/after the start/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save trip' })).toBeDisabled();
  });

  it('marks an overdue trip, offers check-in, and confirms before deleting', () => {
    const now = Date.now();
    store.trips = [
      {
        id: 't1',
        target,
        startAt: now - 10 * HOUR,
        expectedReturnAt: now - 2 * HOUR,
        checkedInAt: null,
        notes: '',
      },
    ];
    render(<TripsModal isOpen onClose={() => {}} uid="u" draft={null} />);

    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText(/nobody has been notified/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "I'm back" }));
    expect(store.checkIn).toHaveBeenCalledWith('t1');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }));
    expect(store.remove).toHaveBeenCalledWith('t1');
  });

  it('asks a signed-out visitor to sign in', () => {
    store.status = 'signed_out';
    render(
      <TripsModal isOpen onClose={() => {}} uid={null} draft={{ target, elevationGainM: null }} />
    );
    expect(screen.getByText('Sign in to plan trips.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save trip' })).toBeNull();
  });
});
