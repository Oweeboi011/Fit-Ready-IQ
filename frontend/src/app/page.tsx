import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, ArrowRight, CloudSun, Mountain, Route, Sparkles, Watch } from 'lucide-react';

import { CopyrightLine } from '@/components/marketing/CopyrightLine';
import { HeaderActions } from '@/components/marketing/HeaderActions';
import { PricingTable } from '@/components/marketing/PricingTable';
import { StartTrialButton } from '@/components/marketing/StartTrialButton';
import { TRIAL_DAYS } from '@/lib/plans';
import { buttonSecondary, buttonSize } from '@/lib/ui';

export const metadata: Metadata = {
  title: 'Fit Ready IQ — Know if you can finish it, before you start',
  description:
    'Fit Ready IQ scores every trail, summit and campsite against your real training data, so you know whether you are ready before you are halfway up.',
  openGraph: {
    title: 'Fit Ready IQ — Know if you can finish it, before you start',
    description:
      'Readiness scores for every route, built from your Strava, Garmin, COROS and Apple Health data.',
    type: 'website',
  },
};

const FEATURES = [
  {
    icon: Activity,
    title: 'A readiness score, not a difficulty rating',
    body: 'Every route is scored against what you have actually been training — your last eight weeks of distance, elevation and pace. Not a generic "moderate" label written for someone else.',
  },
  {
    icon: Watch,
    title: 'Your training, wherever it already lives',
    body: 'Connect Strava in two clicks, or drop in a GPX, TCX or Apple Health export. Nothing to re-log, nothing to re-enter.',
  },
  {
    icon: CloudSun,
    title: 'Conditions on the day you are going',
    body: 'Live forecasts on every summit and campsite, so the decision to turn back happens at the kitchen table rather than the ridgeline.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Connect your training',
    body: 'Strava, Garmin, COROS, Komoot or Apple Health. Takes about twenty seconds.',
  },
  {
    n: '02',
    title: 'Find where you want to go',
    body: 'Trails, summits and campsites near you, with elevation profiles and live weather.',
  },
  {
    n: '03',
    title: 'Get your readiness score',
    body: 'See whether you can finish it today — and what to train if you cannot yet.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-slate-950/85 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation to gain */}
            <img src="/icon.svg" alt="" aria-hidden="true" className="h-7 w-7" />
            <span className="text-[15px] font-bold tracking-tight text-white">Fit Ready IQ</span>
          </Link>

          <HeaderActions />
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* A single, quiet light source. One accent colour, not a rainbow. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 left-1/2 h-[30rem] w-[52rem] -translate-x-1/2 rounded-full bg-blue-600/10 blur-3xl"
          />

          <div className="relative mx-auto max-w-4xl px-5 pb-20 pt-24 text-center sm:pt-32">
            <Link
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-blue-400" />
              Readiness scoring is live for every route
              <ArrowRight aria-hidden="true" className="h-3 w-3" />
            </Link>

            <h1 className="mt-8 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl">
              Know if you can finish it
              <span className="block text-slate-500">before you are halfway up.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-slate-400">
              Fit Ready IQ scores every trail, summit and campsite against your real training data —
              so the hardest decision of the trip is made at home, not on the mountain.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <StartTrialButton />
              <Link href="/app" className={`${buttonSecondary} ${buttonSize.lg}`}>
                Explore the map first
              </Link>
            </div>

            <p className="mt-5 text-xs text-slate-500">
              {TRIAL_DAYS} days of Pro, free · No card required · Works with Strava, Garmin, COROS
              and Apple Health
            </p>
          </div>

          {/* Product preview — real UI, not a mockup image. */}
          <div className="relative mx-auto max-w-3xl px-5 pb-24">
            <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-6 shadow-2xl shadow-blue-950/30 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Mountain aria-hidden="true" className="h-3.5 w-3.5" />
                    Summit route
                  </div>
                  <p className="mt-1.5 text-lg font-semibold text-white">Mount Pulag · Ambangeg</p>
                  <p className="mt-0.5 text-sm text-slate-500">14.8 km · 1,180 m gain · 7–9 hrs</p>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Your readiness
                  </div>
                  <div className="font-tabular text-3xl font-bold text-emerald-400">82</div>
                  <div className="text-xs text-emerald-500/80">Ready</div>
                </div>
              </div>

              <div
                role="img"
                aria-label="Example readiness score: 82 out of 100"
                className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
              >
                <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" />
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-6 sm:grid-cols-4">
                {[
                  ['Weekly volume', '31 km'],
                  ['Elevation base', '1,940 m'],
                  ['Longest recent', '18 km'],
                  ['Forecast', '18°C, clear'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
                    <dd className="font-tabular mt-1 text-sm font-medium text-slate-200">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-white/[0.06] py-24">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Difficulty ratings describe the trail. We describe you on it.
            </h2>

            <div className="mt-14 grid gap-10 md:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/10">
                    <Icon aria-hidden="true" className="h-4 w-4 text-blue-400" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-t border-white/[0.06] py-24">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Three steps, then you know.
            </h2>

            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {STEPS.map(({ n, title, body }) => (
                <li key={n}>
                  <div className="font-tabular text-xs font-semibold tracking-widest text-blue-400">
                    {n}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
                </li>
              ))}
            </ol>

            {/* Secondary: this is the same action as the hero, repeated for
                people who scrolled. The pricing table below is where the real
                decision gets made, so it keeps the primary. */}
            <div className="mt-14">
              <StartTrialButton label={`Start my ${TRIAL_DAYS} days free`} variant="secondary" />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 border-t border-white/[0.06] py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Cheaper than one bad trip.
              </h2>
              <p className="mt-4 text-slate-400">
                Turning back at 2,400 m costs a weekend, a permit and a long drive home. This costs
                less than a trailhead coffee.
              </p>
            </div>

            <div className="mt-14">
              <PricingTable />
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-white/[0.06] py-24">
          <div className="mx-auto max-w-2xl px-5 text-center">
            <Route aria-hidden="true" className="mx-auto h-7 w-7 text-blue-400" />
            <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Your next summit is already on the map.
            </h2>
            <p className="mt-4 text-slate-400">
              Connect your training and find out, in about a minute, whether you are ready for it.
            </p>
            <div className="mt-9 flex justify-center">
              <StartTrialButton variant="secondary" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-xs text-slate-500 sm:flex-row">
          {/* This page is statically prerendered, so `new Date()` here would be
              the build date — the copyright froze at whenever we last deployed.
              The year the product launched does not change, and a range needs
              the current year, so the client island supplies it. */}
          <CopyrightLine />
          <div className="flex items-center gap-5">
            <Link
              href="/app"
              className="rounded transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Open the app
            </Link>
            <Link
              href="#pricing"
              className="rounded transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
