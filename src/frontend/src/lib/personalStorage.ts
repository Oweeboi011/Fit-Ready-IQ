/**
 * Browser storage that holds something about the person, cleared on sign-out.
 *
 * Signing out used to leave all of it behind: the training history, the chat
 * transcript, where they last were. On a shared or borrowed device the next
 * person to open the app saw it. Preferences that say nothing about anyone —
 * theme, filters, which layers are on, the shared places cache — stay.
 *
 * A new key holding personal data belongs here, in the same change.
 */
export const PERSONAL_STORAGE_KEYS = [
  'fri_activities',
  'fri_chat_history',
  'fri_chat_session',
  'fri_last_location',
  // Public place results, but stored with the resolved location they were for.
  'fri_places_cache',
  'fri_map_viewport',
  'fri_saved_plans',
  'fri_strava_last_fetch',
  'fri_strava_last_firestore_sync',
  'fri_strava_oauth_state',
  // Legacy: Strava tokens lived here before they moved server-side.
  'fri_strava_token',
] as const;

export function clearPersonalStorage(): void {
  for (const store of [safeStorage('localStorage'), safeStorage('sessionStorage')]) {
    if (!store) continue;
    for (const key of PERSONAL_STORAGE_KEYS) {
      try {
        store.removeItem(key);
      } catch {
        // Storage that throws on access has nothing we could have left in it.
      }
    }
  }
}

function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window[kind];
  } catch {
    return null;
  }
}
