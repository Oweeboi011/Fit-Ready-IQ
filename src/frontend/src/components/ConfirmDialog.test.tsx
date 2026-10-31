import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(isOpen = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      isOpen={isOpen}
      title="Purge cache?"
      body="Every cached region will be fetched again."
      confirmLabel="Purge everything"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('states the consequence inside a named dialog', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Purge cache?' });
    expect(dialog).toHaveTextContent('Every cached region will be fetched again.');
  });

  it('confirms only through the labelled action', () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Purge everything' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('treats Cancel, Escape and the close button as cancel', () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    renderDialog(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
