import type { Metadata } from 'next';
import Link from 'next/link';

import { AboutDiagrams } from '@/components/about/AboutDiagrams';

export const metadata: Metadata = {
  title: 'How it works — Fit Ready IQ',
  description:
    'A deep dive into how Fit Ready IQ finds routes, scores your readiness, picks a weather window and protects your data.',
};

/**
 * A static page: the diagrams are data (`lib/aboutDiagrams.ts`) and only the
 * canvas is a client island, so reading about the product costs nothing.
 */
export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-4xl px-5 py-16">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
          ← Fit Ready IQ
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-white">How it works</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
          Fit Ready IQ answers one question: <em>this route, this athlete, this weather window</em>.
          Four diagrams follow, from the whole system down to what protects your data. Select any
          box for the detail, or open the text version under each diagram.
        </p>

        <section className="mt-10" aria-label="Diagrams">
          <AboutDiagrams />
        </section>

        <section className="mt-12 space-y-3 text-sm leading-relaxed text-slate-300">
          <h2 className="text-lg font-semibold text-white">Three rules everything follows</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">No number the data does not support.</strong> An
              unknown elevation, difficulty or forecast is shown as unknown, never as a plausible
              guess.
            </li>
            <li>
              <strong className="text-white">Readiness is gated by the limiting factor.</strong>{' '}
              Strong distance never hides weak climbing; the answer names what to train.
            </li>
            <li>
              <strong className="text-white">Failures are sayable.</strong> If a lookup fails, the
              app says which one and offers a retry.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
