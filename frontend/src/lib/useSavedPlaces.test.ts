import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('./firebaseClient', () => ({
  isFirebaseAuthConfigured: vi.fn(() => true),
}));

const mockUnsubscribe = vi.fn();
const mockOnSnapshot = vi.fn();
const mockCollection = vi.fn(() => ({}));
const mockDoc = vi.fn(() => ({}));
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();

vi.mock('firebase/app', () => ({
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: mockCollection,
  onSnapshot: mockOnSnapshot,
  doc: mockDoc,
  setDoc: mockSetDoc,
  deleteDoc: mockDeleteDoc,
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}));

// Import after mocks are registered
const { useSavedPlaces } = await import('./useSavedPlaces');

describe('useSavedPlaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSnapshot.mockReturnValue(mockUnsubscribe);
  });

  it('returns empty array and loading false when uid is null', () => {
    const { result } = renderHook(() => useSavedPlaces(null));
    expect(result.current.savedPlaces).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('isSaved returns false when no places are loaded', () => {
    const { result } = renderHook(() => useSavedPlaces(null));
    expect(result.current.isSaved('any-id')).toBe(false);
  });

  it('subscribes to the correct Firestore path when uid is provided', async () => {
    renderHook(() => useSavedPlaces('user-123'));

    await waitFor(() => {
      expect(mockCollection).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'user-123',
        'saved_places'
      );
    });
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from onSnapshot when unmounted', async () => {
    const { unmount } = renderHook(() => useSavedPlaces('user-123'));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('populates savedPlaces from snapshot and sorts by savedAt descending', async () => {
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      callback({
        docs: [
          {
            id: 'older',
            data: () => ({
              type: 'route',
              name: 'Older Route',
              coordinates: [121.0, 14.5],
              savedAt: { toMillis: () => 1000 },
            }),
          },
          {
            id: 'newer',
            data: () => ({
              type: 'mountain',
              name: 'Newer Peak',
              coordinates: [121.1, 14.6],
              savedAt: { toMillis: () => 2000 },
            }),
          },
        ],
      });
      return mockUnsubscribe;
    });

    const { result } = renderHook(() => useSavedPlaces('user-123'));

    await waitFor(() => expect(result.current.savedPlaces).toHaveLength(2));
    expect(result.current.savedPlaces[0].id).toBe('newer');
    expect(result.current.savedPlaces[1].id).toBe('older');
    expect(result.current.loading).toBe(false);
  });

  it('isSaved returns true after a place is loaded', async () => {
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      callback({
        docs: [
          {
            id: 'mt-pulag',
            data: () => ({
              type: 'mountain',
              name: 'Mt. Pulag',
              coordinates: [120.89, 16.59],
              savedAt: { toMillis: () => 1000 },
            }),
          },
        ],
      });
      return mockUnsubscribe;
    });

    const { result } = renderHook(() => useSavedPlaces('user-123'));

    await waitFor(() => expect(result.current.isSaved('mt-pulag')).toBe(true));
    expect(result.current.isSaved('unknown')).toBe(false);
  });

  it('toggleSave calls deleteDoc when place is already saved', async () => {
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      callback({
        docs: [
          {
            id: 'mt-apo',
            data: () => ({
              type: 'mountain',
              name: 'Mt. Apo',
              coordinates: [125.27, 6.99],
              savedAt: { toMillis: () => 1000 },
            }),
          },
        ],
      });
      return mockUnsubscribe;
    });

    const { result } = renderHook(() => useSavedPlaces('user-123'));
    await waitFor(() => expect(result.current.isSaved('mt-apo')).toBe(true));

    await act(async () => {
      await result.current.toggleSave({
        id: 'mt-apo',
        type: 'mountain',
        name: 'Mt. Apo',
        coordinates: [125.27, 6.99],
      });
    });

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('toggleSave calls setDoc when place is not yet saved', async () => {
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      callback({ docs: [] });
      return mockUnsubscribe;
    });

    const { result } = renderHook(() => useSavedPlaces('user-123'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleSave({
        id: 'trail-1',
        type: 'route',
        name: 'Pulag Trail',
        coordinates: [120.89, 16.59],
        distance_km: 12,
      });
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).not.toHaveBeenCalled();
    const written = mockSetDoc.mock.calls[0][1];
    expect(written.name).toBe('Pulag Trail');
    expect(written.distance_km).toBe(12);
  });

  it('toggleSave does nothing when uid is null', async () => {
    const { result } = renderHook(() => useSavedPlaces(null));

    await act(async () => {
      await result.current.toggleSave({
        id: 'p1',
        type: 'route',
        name: 'Test',
        coordinates: [0, 0],
      });
    });

    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('stops loading and returns empty array when Firebase is not configured', async () => {
    const { isFirebaseAuthConfigured } = await import('./firebaseClient');
    vi.mocked(isFirebaseAuthConfigured).mockReturnValueOnce(false);

    const { result } = renderHook(() => useSavedPlaces('user-123'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.savedPlaces).toEqual([]);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});
