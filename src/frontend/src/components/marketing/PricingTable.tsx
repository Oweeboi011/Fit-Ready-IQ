'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { annualSavingPercent, PLANS, TRIAL_DAYS, type Plan } from '@/lib/plans';
import { buttonSecondary, buttonSize } from '@/lib/ui';

import { StartTrialButton } from './StartTrialButton';

type Billing = 'monthly' | 'annual';

function priceFor(plan: Plan, billing: Billing): number {
  return billing === 'annual' ? plan.annualMonthlyPrice : plan.monthlyPrice;
}

export function PricingTable() {
  const [billing, setBilling] = useState<Billing>('annual');
  const proSaving = annualSavingPercent(PLANS.find((p) => p.featured) ?? PLANS[1]);

  return (
    <div>
      {/* Billing toggle */}
      <div className="mb-10 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Billing period"
          className="inline-flex items-center gap-1 rounded-full border border-ink/[0.08] bg-ink/[0.03] p-1"
        >
          {/* A radiogroup is expected to be one tab stop with arrow keys between
              options; this rendered as two independent tab stops with none. */}
          {(['monthly', 'annual'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={billing === option}
              tabIndex={billing === option ? 0 : -1}
              onClick={() => setBilling(option)}
              onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                e.preventDefault();
                setBilling(billing === 'monthly' ? 'annual' : 'monthly');
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                billing === option
                  ? // The selected pill inverts against the page, so both halves have
                    // to flip with the theme: a literal `bg-white text-slate-900`
                    // becomes white-on-white once slate inverts for light mode.
                    'bg-ink text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option === 'monthly' ? 'Monthly' : `Annual · save ${proSaving}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => {
          const price = priceFor(plan, billing);

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.featured
                  ? 'border-blue-500/40 bg-blue-500/[0.04]'
                  : 'border-ink/[0.07] bg-ink/[0.02]'
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  Most popular
                </span>
              )}

              <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>

              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-tabular text-4xl font-bold tracking-tight text-white">
                  ${price}
                </span>
                <span className="text-sm text-slate-500">
                  {price === 0 ? 'forever' : '/ month'}
                </span>
              </div>
              {price > 0 && billing === 'annual' && (
                <p className="mt-1 text-xs text-slate-500">Billed annually</p>
              )}

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-2.5 text-sm text-slate-300">
                    <Check
                      aria-hidden="true"
                      className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                        plan.featured ? 'text-blue-400' : 'text-slate-500'
                      }`}
                    />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                {plan.featured ? (
                  <StartTrialButton
                    label={`Start ${TRIAL_DAYS} days free`}
                    size="md"
                    plan={plan.id}
                    className="w-full"
                  />
                ) : plan.id === 'free' ? (
                  <StartTrialButton
                    label="Get started free"
                    size="md"
                    variant="secondary"
                    plan={plan.id}
                    className="w-full"
                  />
                ) : (
                  <Link
                    href="mailto:hello@fitreadyiq.com?subject=Guide%20plan"
                    className={`${buttonSecondary} ${buttonSize.md} w-full`}
                  >
                    Talk to us
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        {TRIAL_DAYS} days of Pro on every new account. No card, no auto-charge, cancel by doing
        nothing.
      </p>
    </div>
  );
}
