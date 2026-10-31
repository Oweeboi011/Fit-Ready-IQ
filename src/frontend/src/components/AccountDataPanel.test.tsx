import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountDataPanel } from './AccountDataPanel';

const authedFetch = vi.fn();
vi.mock('@/lib/firebaseClient', () => ({
  authedFetch: (...args: unknown[]) => authedFetch(...args),
}));

beforeEach(() => authedFetch.mockReset());

function openDelete() {
  const onDeleted = vi.fn();
  render(<AccountDataPanel onDeleted={onDeleted} />);
  fireEvent.click(screen.getByRole('button', { name: /Delete account/ }));
  return { onDeleted, confirm: screen.getByRole('button', { name: /Delete permanently/ }) };
}

describe('AccountDataPanel — deletion', () => {
  it('stays disabled until the confirmation word is typed', () => {
    const { confirm } = openDelete();
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'delete' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'DELETE' } });
    expect(confirm).not.toBeDisabled();
  });

  it('sends the confirmation the route requires, then hands off', async () => {
    authedFetch.mockResolvedValue({ ok: true, status: 200 });
    const { confirm, onDeleted } = openDelete();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'DELETE' } });
    fireEvent.click(confirm);

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    const [url, init] = authedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/account/delete');
    expect(JSON.parse(init.body as string)).toEqual({ confirm: 'DELETE' });
  });

  it('says so when deletion fails, and does not sign the user out', async () => {
    authedFetch.mockResolvedValue({ ok: false, status: 500 });
    const { confirm, onDeleted } = openDelete();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'DELETE' } });
    fireEvent.click(confirm);

    expect(await screen.findByRole('alert')).toHaveTextContent(/did not complete/);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe('AccountDataPanel — export', () => {
  it('reports a failed export rather than doing nothing', async () => {
    authedFetch.mockResolvedValue({ ok: false, status: 429 });
    render(<AccountDataPanel onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Download my data/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't download/);
  });
});
