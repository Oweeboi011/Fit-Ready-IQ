import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SaveProposalCard, type PendingSave } from './SaveProposalCard';

const place = {
  id: 'osm-node-2',
  type: 'mountain' as const,
  name: 'Matterhorn',
  coordinates: [7.6586, 45.9764] as [number, number],
};

const card = (state: PendingSave['state'], canSave = true) => {
  const onConfirm = vi.fn();
  const onDecline = vi.fn();
  render(
    <SaveProposalCard
      proposal={{ place, state }}
      canSave={canSave}
      onConfirm={onConfirm}
      onDecline={onDecline}
    />
  );
  return { onConfirm, onDecline };
};

describe('SaveProposalCard', () => {
  it('offers the save and leaves the decision to the user', () => {
    const { onConfirm, onDecline } = card('offered');
    fireEvent.click(screen.getByRole('button', { name: 'Save Matterhorn' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDecline).toHaveBeenCalledOnce();
  });

  it('cannot be pressed twice while saving', () => {
    card('saving');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('confirms only once the write has happened', () => {
    card('saved');
    expect(screen.getByRole('status')).toHaveTextContent('Saved Matterhorn to your places.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says a failed save failed, and keeps the button to retry', () => {
    card('failed');
    expect(screen.getByRole('alert')).toHaveTextContent("That didn't save.");
    expect(screen.getByRole('button', { name: 'Save Matterhorn' })).toBeEnabled();
  });

  it('asks a signed-out user to sign in instead of offering a save', () => {
    card('offered', false);
    expect(screen.getByText('Sign in to save Matterhorn to your places.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('records a decline quietly', () => {
    card('declined');
    expect(screen.getByText('Not saved.')).toBeInTheDocument();
  });
});
