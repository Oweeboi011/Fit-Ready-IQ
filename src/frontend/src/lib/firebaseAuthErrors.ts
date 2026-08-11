/**
 * Firebase error codes → something a hiker can act on.
 *
 * The misconfiguration codes (`unauthorized-domain`, `operation-not-allowed`)
 * describe a mistake we made, not one the user can fix, so they get an apology
 * rather than instructions for a console they cannot open. The real cause still
 * reaches us through `console.error`.
 */
export function signInErrorMessage(code: string, provider: 'Google' | 'Apple'): string {
  switch (code) {
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network trouble during sign-in. Check your connection and try again.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
      return `${provider} sign-in isn't available right now. We're on it — try another sign-in option.`;
    case 'auth/account-exists-with-different-credential':
      return 'That email is already registered with a different sign-in method.';
    default:
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return "You're offline. Reconnect and try again.";
      }
      return `${provider} sign-in didn't complete. Try again.`;
  }
}
