import type { Metadata } from 'next';
import Link from 'next/link';

import { RETENTION } from '@/lib/privacyFacts';

export const metadata: Metadata = {
  title: 'Privacy — Fit Ready IQ',
  description:
    'What Fit Ready IQ stores about you, where it goes, how long it is kept, and how to take it with you or delete it.',
};

const LAST_UPDATED = '28 September 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

/**
 * A plain account of what the product does with data, kept beside the code
 * that does it. Every statement here is something the code enforces — see
 * `lib/userDataFootprint.ts` for the list export and erasure walk.
 *
 * Google sign-in verification and the Strava API agreement both require a
 * privacy policy; there was no page at all.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-2xl px-5 py-16">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
          ← Fit Ready IQ
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-white">Privacy</h1>
        <p className="mt-2 text-xs text-slate-500">Last updated {LAST_UPDATED}</p>

        <Section title="Without an account">
          <p>
            You can browse the map without signing in. We use your location, if you allow it, to
            find places near you. It is not stored on our servers. Your browser keeps your last
            location so the map opens in the same place next time.
          </p>
          <p>
            Conversations with the assistant while signed out are not stored on our servers. Your
            browser keeps them for {RETENTION.browserChatHours} hours so you can pick up where you
            left off.
          </p>
        </Section>

        <Section title="What we store when you sign in">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Your account</strong>: name, email and profile photo
              from Google or Apple, held by Firebase Authentication.
            </li>
            <li>
              <strong className="text-white">Saved places</strong>: the trails, peaks and campsites
              you bookmark.
            </li>
            <li>
              <strong className="text-white">Strava</strong>, if you connect it: your activities
              (name, date, distance, elevation, time, heart rate, start and end points and route
              line) and the credentials that let us fetch them. The credentials are held only on our
              servers and never sent to your browser.
            </li>
            <li>
              <strong className="text-white">Assistant conversations</strong>: kept for{' '}
              {RETENTION.chatDays} days so you can resume them, then deleted automatically.
            </li>
            <li>
              <strong className="text-white">Shared map cache</strong>: when your visit fetches
              places for an area, the results are cached for {RETENTION.placesCacheHours} hours for
              other visitors to that area, marked with your account so misuse can be traced.
            </li>
          </ul>
          <p>
            Files you import from Garmin, COROS, Komoot or Apple Health are read in your browser and
            kept there. They are not uploaded to us.
          </p>
        </Section>

        <Section title="Who else sees it">
          <p>To work, the product sends data to these services:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Google</strong>: map locations to Maps, Places,
              Elevation, Geocoding, Routes and Weather; your assistant messages to Gemini; and your
              account and stored data to Firebase, which hosts them.
            </li>
            <li>
              <strong className="text-white">Strava</strong>: only if you connect it, to fetch your
              activities.
            </li>
            <li>
              <strong className="text-white">OpenWeather</strong>: a location, when Google&apos;s
              forecast is unavailable.
            </li>
            <li>
              <strong className="text-white">Vercel</strong>: hosts the site, and keeps the request
              logs any web server does.
            </li>
          </ul>
          <p>The product loads no advertising or analytics scripts.</p>
        </Section>

        <Section title="Records we keep for security">
          <p>
            Administrative actions, refused access attempts and account deletions are recorded, with
            the account involved but never the content of what was deleted, for{' '}
            {RETENTION.auditDays / 365} years. A deletion record is how we can show a deletion
            happened, so it outlives the account.
          </p>
          <p>
            To limit abuse, we count requests per account or network address for{' '}
            {RETENTION.rateLimitHours} hours. The key is a one-way hash, not the address itself.
          </p>
        </Section>

        <Section title="Taking it with you, or deleting it">
          <p>
            Signed in, open your profile and go to <strong className="text-white">Your data</strong>
            .
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Download my data</strong> gives you everything we hold
              about you as one file.
            </li>
            <li>
              <strong className="text-white">Delete account</strong> removes your account and
              everything above, and withdraws our access to your Strava account. The security
              records described above are kept.
            </li>
          </ul>
          <p>Signing out clears what this browser holds about you.</p>
        </Section>
      </main>
    </div>
  );
}
