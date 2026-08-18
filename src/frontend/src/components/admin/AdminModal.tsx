'use client';

import {
  Activity as ActivityIcon,
  Database,
  Gauge,
  RefreshCw,
  ScrollText,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import Modal from '@/components/Modal';
import { authedFetch } from '@/lib/firebaseClient';
import { buttonGhost, buttonSecondary, buttonSize } from '@/lib/ui';

import { ActivityTab, CachingTab, CostTab, EfficiencyTab, GovernanceTab } from './tabs';
import type { AdminData } from './types';

type TabId = 'activity' | 'cost' | 'governance' | 'caching' | 'efficiency';

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: 'activity', label: 'Activity', Icon: ActivityIcon },
  { id: 'cost', label: 'Cost', Icon: Wallet },
  { id: 'governance', label: 'Governance', Icon: ScrollText },
  { id: 'caching', label: 'Caching', Icon: Database },
  { id: 'efficiency', label: 'Efficiency', Icon: Gauge },
];

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Operator console, in a modal over the map.
 *
 * The standalone `/admin/settings` page still exists, but it is a separate
 * navigation that loses whatever you were looking at. Most of what an operator
 * checks — is the cache warm, did syncs run, are credentials present — is a
 * glance, not a session.
 *
 * Every number here comes from a real endpoint. Where we genuinely cannot know
 * something (spend, without a billing integration) the panel says so instead of
 * printing a plausible figure.
 */
export default function AdminModal({ isOpen, onClose }: AdminModalProps) {
  const [tab, setTab] = useState<TabId>('activity');
  const [data, setData] = useState<AdminData>({
    cache: null,
    stravaSync: null,
    health: null,
    status: 'loading',
    error: null,
  });

  const load = useCallback(async () => {
    setData((d) => ({ ...d, status: 'loading', error: null }));

    // Each source is independent; one failing must not blank the others.
    const [cache, stravaSync, health] = await Promise.all([
      authedFetch('/api/admin/cache')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      authedFetch('/api/admin/strava-sync')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/api/health')
        .then((r) => r.json())
        .catch(() => null),
    ]);

    setData({
      cache,
      stravaSync,
      health: health?.services ?? null,
      status: 'ready',
      error:
        cache === null && stravaSync === null && health === null
          ? 'Could not reach any admin endpoint.'
          : null,
    });
  }, []);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-3xl"
      title={
        <div>
          <h2 className="text-base font-semibold text-white">Admin</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">Site activity, cost and governance</p>
        </div>
      }
      headerExtra={
        <button
          type="button"
          onClick={load}
          disabled={data.status === 'loading'}
          className={`${buttonGhost} ${buttonSize.sm}`}
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${data.status === 'loading' ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      }
    >
      <div className="p-5">
        {data.error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100"
          >
            {data.error}
          </div>
        )}

        <div
          role="tablist"
          aria-label="Admin sections"
          className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-ink/[0.06] bg-ink/[0.03] p-1 sm:grid-cols-5"
        >
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                tab === id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:bg-ink/5 hover:text-slate-200'
              }`}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'activity' && <ActivityTab data={data} />}
        {tab === 'cost' && <CostTab data={data} />}
        {tab === 'governance' && <GovernanceTab data={data} />}
        {tab === 'caching' && <CachingTab data={data} onRefresh={load} />}
        {tab === 'efficiency' && <EfficiencyTab data={data} />}

        <div className="mt-5 border-t border-ink/[0.06] pt-4">
          <a href="/admin/settings" className={`${buttonSecondary} ${buttonSize.sm}`}>
            Open the full console
          </a>
        </div>
      </div>
    </Modal>
  );
}
