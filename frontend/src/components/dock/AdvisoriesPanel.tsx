'use client';

import { AlertOctagon, Ban, Info, LifeBuoy, Megaphone, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { Advisory, AdvisoryKind } from '@/app/api/advisories/route';

const KIND_ICON: Record<AdvisoryKind, LucideIcon> = {
  closure: Ban,
  hazard: TriangleAlert,
  rescue: LifeBuoy,
  emergency: AlertOctagon,
  report: Info,
  announcement: Megaphone,
};

const KIND_LABEL: Record<AdvisoryKind, string> = {
  closure: 'Closure',
  hazard: 'Hazard',
  rescue: 'Rescue',
  emergency: 'Emergency',
  report: 'Trail report',
  announcement: 'Announcement',
};

/** Closures and emergencies read loud; reports and announcements recede. */
const KIND_TONE: Record<AdvisoryKind, string> = {
  closure: 'border-red-500/30 bg-red-500/10 text-red-100',
  emergency: 'border-red-500/30 bg-red-500/10 text-red-100',
  rescue: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  hazard: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  report: 'border-white/10 bg-white/5 text-slate-300',
  announcement: 'border-white/10 bg-white/5 text-slate-300',
};

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}

export function AdvisoriesPanel({
  advisories,
  configured,
  status,
  onSelect,
}: {
  advisories: Advisory[];
  configured: boolean;
  status: 'idle' | 'loading' | 'error';
  onSelect: (advisory: Advisory) => void;
}) {
  if (status === 'loading') {
    return (
      <p role="status" className="py-2 text-xs text-slate-400">
        Checking for advisories…
      </p>
    );
  }

  // Saying "no advisories" when we never asked anyone would imply the trails
  // are clear. That is not a claim this app is in a position to make.
  if (!configured) {
    return (
      <div className="py-1">
        <p className="text-xs text-slate-300">No advisory source connected.</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          Closures, hazards and rescue notices come from park authorities and local units, which
          differ by region. Set <code className="text-slate-400">ADVISORY_FEED_URL</code> to a feed
          for your area. Until then, check with the local authority before you go.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <p className="py-2 text-xs text-amber-200">
        The advisory feed is unreachable. Treat this as unknown, not as all-clear.
      </p>
    );
  }

  if (advisories.length === 0) {
    return (
      <p className="py-2 text-xs text-slate-400">
        No advisories in the last 30 days for this feed.
      </p>
    );
  }

  return (
    <ul className="max-h-64 space-y-2 overflow-y-auto">
      {advisories.map((advisory) => {
        const Icon = KIND_ICON[advisory.kind];
        return (
          <li key={advisory.id}>
            <button
              type="button"
              onClick={() => onSelect(advisory)}
              disabled={!advisory.coordinates}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${KIND_TONE[advisory.kind]} ${
                advisory.coordinates ? 'hover:brightness-125' : 'cursor-default'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon aria-hidden="true" className="h-3 w-3 flex-shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-wider">
                  {KIND_LABEL[advisory.kind]}
                </span>
                <span className="ml-auto text-[9px] opacity-70">
                  {relativeDate(advisory.publishedAt)}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold leading-snug">{advisory.title}</p>
              {advisory.areaName && (
                <p className="mt-0.5 text-[10px] opacity-70">{advisory.areaName}</p>
              )}
              <p className="mt-1 text-[9px] opacity-60">via {advisory.source}</p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
