'use client';

import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { consumeStravaOAuthState } from '@/lib/stravaAuth';
import { buttonGhost, buttonPrimary, buttonSize } from '@/lib/ui';

/** The exchange rarely takes more than a second; past this it is not coming back. */
const EXCHANGE_TIMEOUT_MS = 15_000;

/** Where the user came from and where they belong afterwards. Never the marketing page. */
const APP_PATH = '/app';

type Outcome =
  | { state: 'working' }
  | { state: 'done' }
  | { state: 'failed'; title: string; detail: string; canRetry: boolean };

function Spinner() {
  return (
    <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
  );
}

function StravaCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [outcome, setOutcome] = useState<Outcome>({ state: 'working' });

  useEffect(() => {
    const code = searchParams.get('code');
    const denied = searchParams.get('error');

    if (denied) {
      setOutcome({
        state: 'failed',
        title: 'Strava connection cancelled',
        detail: 'You can connect Strava any time from Connect Devices.',
        canRetry: true,
      });
      return;
    }

    if (!code) {
      setOutcome({
        state: 'failed',
        title: 'That link was incomplete',
        detail:
          'Strava did not send an authorisation code. Starting the connection again usually fixes it.',
        canRetry: true,
      });
      return;
    }

    // Only honour a callback for a flow this tab started. Without this check the
    // page would exchange any code it was handed, so a crafted link could bind
    // this browser to somebody else's Strava account. Consuming the nonce also
    // makes the check single-use, so the same callback URL cannot be replayed.
    if (!consumeStravaOAuthState(searchParams.get('state'))) {
      setOutcome({
        state: 'failed',
        title: "We couldn't verify that connection",
        detail:
          'This link did not come from a connection started in this tab, or it has already been used. Start the connection again from Connect Devices.',
        canRetry: true,
      });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);

    fetch('/api/strava/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.access_token) {
          setOutcome({
            state: 'failed',
            title: 'Strava did not accept the connection',
            detail: 'The authorisation code may have already been used. Try connecting again.',
            canRetry: true,
          });
          return;
        }

        // If we cannot store the token, the connection did not really happen —
        // saying "Connected!" here would strand the user on a map with no data.
        try {
          localStorage.setItem(
            'fri_strava_token',
            JSON.stringify({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expires_at: data.expires_at,
              athlete: data.athlete,
            })
          );
        } catch {
          setOutcome({
            state: 'failed',
            title: 'We could not save your Strava connection',
            detail:
              'Your browser is blocking local storage. Private browsing usually causes this — try again in a normal window.',
            canRetry: false,
          });
          return;
        }

        setOutcome({ state: 'done' });
        router.replace(APP_PATH);
      })
      .catch((err: unknown) => {
        const timedOut = err instanceof DOMException && err.name === 'AbortError';
        setOutcome({
          state: 'failed',
          title: timedOut ? 'Strava took too long to respond' : 'We could not reach Strava',
          detail: timedOut
            ? 'The connection timed out. Strava may be busy — trying again usually works.'
            : 'Check your connection and try again.',
          canRetry: true,
        });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchParams, router]);

  const retry = useCallback(() => {
    // Send them back to the map with the modal open, rather than restarting
    // OAuth from a page that has no idea which device they were connecting.
    router.replace(`${APP_PATH}?connect=strava`);
  }, [router]);

  if (outcome.state === 'failed') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-ink/[0.08] bg-slate-900 p-6 text-center shadow-2xl">
          <AlertCircle aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-amber-400" />
          <h1 className="text-lg font-semibold text-white">{outcome.title}</h1>
          <p className="mt-2 text-sm text-slate-400">{outcome.detail}</p>
          <div className="mt-6 flex flex-col gap-2">
            {outcome.canRetry && (
              <button
                type="button"
                onClick={retry}
                className={`${buttonPrimary} ${buttonSize.md} w-full`}
              >
                Try again
              </button>
            )}
            <Link href={APP_PATH} className={`${buttonGhost} ${buttonSize.md} w-full`}>
              Back to the map
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950">
      <div role="status" className="text-center">
        <Spinner />
        <p className="text-lg font-semibold text-white">
          {outcome.state === 'done'
            ? 'Connected. Loading your activities…'
            : 'Connecting to Strava…'}
        </p>
        <p className="mt-2 text-sm text-slate-400">This only takes a moment.</p>
      </div>
    </main>
  );
}

export default function StravaCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950">
          <Spinner />
        </main>
      }
    >
      <StravaCallbackInner />
    </Suspense>
  );
}
