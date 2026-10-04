import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import Modal from './Modal';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal
        isOpen={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Trail details"
      >
        <button type="button">Inside</button>
      </Modal>
    </>
  );
}

function openModal(onClose?: () => void) {
  render(<Harness onClose={onClose} />);
  const trigger = screen.getByRole('button', { name: 'Open' });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole('dialog', { name: 'Trail details' }) };
}

// jsdom computes no layout, so offsetParent is always null and the trap would
// see no visible stops. Give every element one; tests/e2e/modal-dialog.spec.ts
// covers the same behaviour in a real browser.
const nativeOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return document.body;
    },
  });
});

afterAll(() => {
  if (nativeOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', nativeOffsetParent);
  }
});

describe('Modal', () => {
  it('wraps Tab at both ends instead of letting focus escape', () => {
    const { dialog } = openModal();
    const close = screen.getByRole('button', { name: 'Close' });
    const inside = screen.getByRole('button', { name: 'Inside' });

    inside.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(inside);
  });

  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog named by its title', () => {
    const { dialog } = openModal();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus inside on open and returns it to the trigger on close', () => {
    const { trigger, dialog } = openModal();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    const { dialog } = openModal(onClose);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a backdrop press but not on a press inside the panel', () => {
    const onClose = vi.fn();
    const { dialog } = openModal(onClose);
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks page scroll while open and restores it after', () => {
    document.body.style.overflow = 'auto';
    openModal();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.body.style.overflow).toBe('auto');
  });
});
