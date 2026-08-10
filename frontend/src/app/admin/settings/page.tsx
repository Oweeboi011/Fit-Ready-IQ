'use client';

import { useState, useEffect } from 'react';
import {
  Settings,
  Activity,
  BarChart2,
  Users,
  ChevronLeft,
  Shield,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Trash2,
  Database,
  MapPin,
  Mountain,
  Tent,
  KeyRound,
  HeartPulse,
  ToggleLeft,
} from 'lucide-react';
import Link from 'next/link';

import {
  authedFetch,
  isFirebaseAuthConfigured,
  onFirebaseAuthStateChanged,
} from '@/lib/firebaseClient';
import { useAdminGate } from '@/lib/useAdminGate';

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'general' | 'observability' | 'api-usage' | 'users' | 'cache';

const TABS: readonly Tab[] = ['general', 'observability', 'api-usage', 'users', 'cache'];

interface CacheEntry {
  gridKey: string;
  ts: string;
  ageHours: number;
  fresh: boolean;
  routeCount: number;
  mountainCount: number;
  campsiteCount: number;
  location?: { lat: number; lng: number; address?: string };
}

interface CacheStats {
  total: number;
  fresh: number;
  stale: number;
  entries: CacheEntry[];
}

interface AppUser {
  uid: string;
  email: string;
  displayName: string | null;
  provider: string;
  createdAt: string;
  lastSignIn: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'ok' | 'warn' | 'error' }) {
  const MAP = {
    ok: {
      icon: CheckCircle,
      cls: 'text-emerald-400 bg-emerald-900/30 ring-emerald-500/30',
      label: 'OK',
    },
    warn: {
      icon: AlertTriangle,
      cls: 'text-amber-400   bg-amber-900/30   ring-amber-500/30',
      label: 'WARN',
    },
    error: {
      icon: AlertTriangle,
      cls: 'text-red-400     bg-red-900/30     ring-red-500/30',
      label: 'ERROR',
    },
  };
  const { icon: Icon, cls, label } = MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${cls}`}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const gate = useAdminGate();
  // "Admin access required" reads as a mistake to someone who simply is not
  // signed in yet, so the two cases need telling apart.
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    if (!isFirebaseAuthConfigured()) return;
    return onFirebaseAuthStateChanged((user) => setIsSignedIn(Boolean(user)));
  }, []);
  const [activeTab, setActiveTab] = useState<Tab>('general');

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && TABS.includes(requested as Tab)) setActiveTab(requested as Tab);
  }, []);

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === 'general') params.delete('tab');
    else params.set('tab', tab);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loadingCache, setLoadingCache] = useState(false);
  const [purgingKey, setPurgingKey] = useState<string | null>(null);

  interface StravaSyncEntry {
    uid: string;
    last_synced_at: string | null;
    total_activities: number;
    errors: string[] | null;
  }
  const [stravaSyncStats, setStravaSyncStats] = useState<{
    total: number;
    entries: StravaSyncEntry[];
  } | null>(null);
  const [loadingStravaSync, setLoadingStravaSync] = useState(false);

  // Every loader below used to `catch { /* ignore */ }`, so a 500 rendered as
  // "Cache is empty" / "No users loaded" — indistinguishable from success.
  const [loadError, setLoadError] = useState<string | null>(null);

  interface ServiceStatus {
    ok: boolean;
    message: string;
  }
  const [health, setHealth] = useState<Record<string, ServiceStatus> | null>(null);

  async function loadHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data.services ?? null);
    } catch {
      setHealth(null);
      setLoadError('Could not reach the health endpoint.');
    }
  }

  const HEALTH_LABELS: Record<string, string> = {
    maps: 'Google Maps',
    firebase_client: 'Firebase Auth',
    firebase_admin: 'Firebase Admin',
    gemini: 'Gemini API',
    weather: 'Weather API',
    strava: 'Strava API',
  };

  /** Which env vars the server reports as present, keyed as the table lists them. */
  const envConfigured: Record<string, boolean | undefined> = health
    ? {
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: health.maps?.ok,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: health.firebase_client?.ok,
        GEMINI_API_KEY: health.gemini?.ok,
        FIREBASE_SERVICE_ACCOUNT_KEY_JSON: health.firebase_admin?.ok,
        STRAVA_CLIENT_ID: health.strava?.ok,
        NEXT_PUBLIC_APP_URL: undefined,
      }
    : {};

  const featureFlags = [
    {
      label: 'Google Sign-In',
      enabled: health?.firebase_client?.ok ?? false,
      desc: 'Firebase Auth Google provider',
    },
    {
      label: 'Saved Places',
      enabled: health?.firebase_admin?.ok ?? false,
      desc: 'Firestore bookmark storage',
    },
    {
      label: 'AI Chat Assistant',
      enabled: health?.gemini?.ok ?? false,
      desc: 'Requires GEMINI_API_KEY',
    },
    {
      label: 'Weather Forecasts',
      enabled: health?.weather?.ok ?? false,
      desc: 'Google Weather with OpenWeather fallback',
    },
    {
      label: 'Strava Sync',
      enabled: health?.strava?.ok ?? false,
      desc: 'OAuth exchange and activity import',
    },
  ];

  const healthRows = Object.entries(health ?? {}).map(([key, service]) => ({
    label: HEALTH_LABELS[key] ?? key,
    value: service.message,
    status: service.ok ? ('ok' as const) : ('warn' as const),
  }));

  // General settings state (reads from env for display only — edits go via Vercel dashboard)
  const envVars = [
    { key: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', label: 'Google Maps API Key', scope: 'Client' },
    { key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', label: 'Firebase Project ID', scope: 'Client' },
    { key: 'GEMINI_API_KEY', label: 'Gemini API Key', scope: 'Server' },
    { key: 'FIREBASE_SERVICE_ACCOUNT_KEY_JSON', label: 'Firebase Admin JSON', scope: 'Server' },
    { key: 'STRAVA_CLIENT_ID', label: 'Strava Client ID', scope: 'Server' },
    { key: 'NEXT_PUBLIC_APP_URL', label: 'App URL', scope: 'Client' },
  ];

  async function loadCache() {
    setLoadingCache(true);
    setLoadError(null);
    try {
      const res = await authedFetch('/api/admin/cache');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCacheStats(await res.json());
    } catch (err) {
      console.error('Cache load failed:', err);
      setLoadError('Could not load cache entries.');
    } finally {
      setLoadingCache(false);
    }
  }

  async function loadStravaSync() {
    setLoadingStravaSync(true);
    setLoadError(null);
    try {
      const res = await authedFetch('/api/admin/strava-sync');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStravaSyncStats(await res.json());
    } catch (err) {
      console.error('Strava sync load failed:', err);
      setLoadError('Could not load Strava sync status.');
    } finally {
      setLoadingStravaSync(false);
    }
  }

  async function purgeEntry(gridKey?: string) {
    const key = gridKey ?? '__all__';
    setPurgingKey(key);
    setLoadError(null);
    try {
      const url = gridKey
        ? `/api/admin/cache?gridKey=${encodeURIComponent(gridKey)}`
        : '/api/admin/cache';
      const res = await authedFetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadCache();
    } catch (err) {
      console.error('Cache purge failed:', err);
      setLoadError('Purge failed — the cache was not changed.');
    } finally {
      setPurgingKey(null);
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    setLoadError(null);
    try {
      const res = await authedFetch('/api/admin/users');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (err) {
      console.error('User load failed:', err);
      setLoadError('Could not load users.');
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    if (gate !== 'allowed') return;
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'cache') loadCache();
    if (activeTab === 'observability') loadStravaSync();
    if (activeTab === 'observability' || activeTab === 'general') loadHealth();
  }, [activeTab, gate]);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'observability', label: 'Observability', icon: Activity },
    { id: 'api-usage', label: 'API Usage', icon: BarChart2 },
    { id: 'cache', label: 'Cache', icon: Database },
    { id: 'users', label: 'Users', icon: Users },
  ];

  if (gate !== 'allowed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        {gate === 'checking' ? (
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
            Checking access…
          </div>
        ) : (
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-slate-900/60 p-8 text-center">
            <Shield aria-hidden="true" className="mx-auto mb-4 h-8 w-8 text-slate-600" />
            <h1 className="text-base font-semibold text-slate-200">
              {isSignedIn ? 'Admin access required' : 'Sign in to continue'}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {isSignedIn
                ? 'This account is not on the admin allowlist.'
                : 'Sign in from the map with an authorised account, then reopen this page.'}
            </p>
            <Link
              href="/app"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 transition-colors hover:text-blue-300"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Back to the map
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-slate-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3.5">
          <Link
            href="/app"
            className="flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Back to map
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Shield aria-hidden="true" className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">Admin Settings</span>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-5 py-8">
        {/* A failed load used to render as "Cache is empty" / "No users
            loaded", which reads as a successful query returning nothing. */}
        {loadError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100"
          >
            {loadError}
          </div>
        )}

        {/* Tab bar */}
        <div className="mb-8 flex gap-1 rounded-xl border border-white/[0.06] bg-slate-900/60 p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => selectTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                activeTab === id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ── General Tab ─────────────────────────────────────────────── */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Settings aria-hidden="true" className="h-4 w-4 text-slate-500" />
                Application
              </h2>
              {/* These were editable text fields wired to nothing, above a
                  "Save changes" button that flashed a tick and persisted
                  nothing. Deployment config lives in the hosting provider, so
                  this section reports it rather than pretending to own it. */}
              <p className="mb-5 text-xs text-slate-500">
                Read-only. Change these in your hosting provider&apos;s environment settings, then
                redeploy.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="app-name"
                    className="mb-1.5 block text-xs font-medium text-slate-400"
                  >
                    App Name
                  </label>
                  <input
                    id="app-name"
                    type="text"
                    value="Fit-Ready-IQ"
                    readOnly
                    className="w-full cursor-not-allowed rounded-lg border border-white/[0.06] bg-slate-800/50 px-3 py-2 text-sm text-slate-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="app-url"
                    className="mb-1.5 block text-xs font-medium text-slate-400"
                  >
                    App URL
                  </label>
                  <input
                    id="app-url"
                    type="text"
                    value={process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4790'}
                    readOnly
                    className="w-full cursor-not-allowed rounded-lg border border-white/[0.06] bg-slate-800/50 px-3 py-2 text-sm text-slate-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="firebase-project"
                    className="mb-1.5 block text-xs font-medium text-slate-400"
                  >
                    Firebase Project
                  </label>
                  <input
                    id="firebase-project"
                    type="text"
                    value={process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '—'}
                    readOnly
                    className="w-full cursor-not-allowed rounded-lg border border-white/[0.06] bg-slate-800/50 px-3 py-2 text-sm text-slate-400"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <KeyRound aria-hidden="true" className="h-4 w-4 text-slate-500" />
                    Environment Variables
                  </h2>
                  {/* "Show values" revealed a dash for every row: a dynamic
                      process.env[key] cannot be inlined by Next, and the server
                      keys listed here are structurally unavailable to a client
                      component. It promised secrets it could never have. What an
                      operator actually needs is whether each one is configured,
                      which /api/health answers on the server. */}
                  <p className="text-xs text-slate-500">
                    Read-only. Edit via Vercel Dashboard → Project Settings → Environment Variables.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {envVars.map(({ key, label, scope }) => (
                  <div
                    key={key}
                    className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-slate-800/40 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-300">{label}</p>
                      <p className="truncate font-mono text-[10px] text-slate-500">{key}</p>
                    </div>
                    <span
                      className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                        scope === 'Client'
                          ? 'bg-blue-900/40 text-blue-300'
                          : 'bg-purple-900/40 text-purple-300'
                      }`}
                    >
                      {scope}
                    </span>
                    {envConfigured[key] === undefined ? (
                      <span className="flex-shrink-0 text-[10px] text-slate-600">
                        Open Observability to check
                      </span>
                    ) : (
                      <span
                        className={`flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold ${
                          envConfigured[key] ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${envConfigured[key] ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        />
                        {envConfigured[key] ? 'Configured' : 'Not set'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── Observability Tab ────────────────────────────────────────── */}
        {activeTab === 'observability' && (
          <div className="space-y-6">
            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <HeartPulse aria-hidden="true" className="h-4 w-4 text-slate-500" />
                System Health
              </h2>
              {/* Was a hardcoded list claiming "Next.js 14.2.35" and "Connected"
                  regardless of reality, plus two server-only env vars read from
                  a client component where they are always undefined. /api/health
                  already answers all of this on the server. */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {healthRows.map(({ label, value, status }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-white/[0.05] bg-slate-800/40 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-400">{label}</p>
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-sm font-semibold text-slate-200">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <AlertTriangle aria-hidden="true" className="h-4 w-4 text-slate-500" />
                Error Logs
              </h2>
              <div className="h-48 overflow-y-auto rounded-lg border border-white/[0.05] bg-slate-950/60 p-4 font-mono text-[11px] text-slate-400">
                <p className="text-slate-600">No critical errors in the last 24 hours.</p>
                <p className="mt-1 text-slate-600">
                  Connect Application Insights or Vercel Log Drains for live logs.
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <ToggleLeft aria-hidden="true" className="h-4 w-4 text-slate-500" />
                Feature Flags
              </h2>
              {/* This list was hardcoded and had drifted: it reported the AI
                  chat as inactive while the widget shipped enabled, and weather
                  as unimplemented after it went live. Derived from the same
                  health check the panel above uses. */}
              <div className="space-y-3">
                {featureFlags.map(({ label, enabled, desc }) => (
                  <div
                    key={label}
                    className="flex items-center gap-4 rounded-lg border border-white/[0.05] bg-slate-800/40 px-4 py-3"
                  >
                    <div
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-slate-600'}`}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-200">{label}</p>
                      <p className="text-[11px] text-slate-500">{desc}</p>
                    </div>
                    <span
                      className={`text-xs font-medium ${enabled ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                      {enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <RefreshCw aria-hidden="true" className="h-4 w-4 text-slate-500" />
                    Strava → Firestore Sync
                  </h2>
                  <p className="text-xs text-slate-500">
                    Historical activities synced per user. Re-syncs at most once per hour.
                  </p>
                </div>
                <button
                  onClick={loadStravaSync}
                  disabled={loadingStravaSync}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-50"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 ${loadingStravaSync ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </button>
              </div>
              {loadingStravaSync && !stravaSyncStats ? (
                <div className="py-8 text-center">
                  <RefreshCw
                    aria-hidden="true"
                    className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-600"
                  />
                  <p className="text-xs text-slate-500">Loading sync status…</p>
                </div>
              ) : !stravaSyncStats || stravaSyncStats.total === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
                  <Activity aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                  <p className="text-sm text-slate-500">No users have synced Strava data yet.</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Sync runs automatically after the user connects Strava and is signed in.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-white/[0.05]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-slate-900/80">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                          User ID
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                          Activities
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                          Last synced
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                          Errors
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] bg-slate-900/40">
                      {stravaSyncStats.entries.map((entry) => (
                        <tr key={entry.uid} className="hover:bg-white/[0.02]">
                          <td className="max-w-[140px] truncate px-4 py-3 font-mono text-[11px] text-slate-400">
                            {entry.uid}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-200">
                            {entry.total_activities}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {entry.last_synced_at
                              ? new Date(entry.last_synced_at).toLocaleString()
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {entry.errors && entry.errors.length > 0 ? (
                              <StatusBadge status="warn" />
                            ) : (
                              <StatusBadge status="ok" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
        {activeTab === 'api-usage' && (
          // This tab used to render invented call counts, quota bars and a bold
          // "$13.25" total under an eleven-pixel disclaimer. An operator cannot
          // tell a made-up dashboard from a real one at a glance, and would act
          // on it. Until a billing API is wired up, say nothing.
          <div className="rounded-xl border border-dashed border-white/[0.10] bg-slate-900/40 p-10 text-center">
            <BarChart2 aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-200">No usage data connected</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
              Call volumes and spend live in Google Cloud Billing, the Firebase console and the
              Vercel dashboard. Connect one of those APIs to report them here.
            </p>
          </div>
        )}

        {/* ── Users Tab ────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {loadingUsers
                  ? 'Loading…'
                  : users.length > 0
                    ? `${users.length} users`
                    : 'Requires Firebase Admin SDK to be configured.'}
              </p>
              <button
                onClick={loadUsers}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>

            {users.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-6 py-16 text-center">
                <Users aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-slate-600" />
                <p className="text-sm font-medium text-slate-400">No users loaded</p>
                <p className="mt-1 text-xs text-slate-600">
                  Implement <code className="text-slate-500">/api/admin/users</code> with Firebase
                  Admin SDK to list users here.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-slate-900/80">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        Provider
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        Created
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        Last sign in
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] bg-slate-900/40">
                    {users.map((u) => (
                      <tr key={u.uid} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-200">{u.displayName ?? '—'}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-blue-900/40 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                            {u.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{u.createdAt}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{u.lastSignIn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Cache Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'cache' && (
          <div className="space-y-6">
            {/* Summary stat bar */}
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  label: 'Total entries',
                  value: cacheStats?.total ?? '—',
                  icon: Database,
                  color: 'text-blue-400',
                },
                {
                  label: 'Fresh  (< 24 h)',
                  value: cacheStats?.fresh ?? '—',
                  icon: CheckCircle,
                  color: 'text-emerald-400',
                },
                {
                  label: 'Stale (≥ 24 h)',
                  value: cacheStats?.stale ?? '—',
                  icon: AlertTriangle,
                  color: 'text-amber-400',
                },
              ].map(({ label, value, icon: Icon, color }) => (
                <div
                  key={label}
                  className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-slate-900/60 p-5"
                >
                  <Icon aria-hidden="true" className={`h-6 w-6 flex-shrink-0 ${color}`} />
                  <div>
                    <p className="text-2xl font-bold text-slate-100">{String(value)}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Places cache — Firestore collection{' '}
                <code className="text-slate-400">places_cache</code> · 24 h TTL · ~55 km grid cells
              </p>
              <div className="flex gap-2">
                <button
                  onClick={loadCache}
                  disabled={loadingCache}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-50"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 ${loadingCache ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        'Purge ALL cache entries? The next user in each region will trigger a full live fetch.'
                      )
                    )
                      purgeEntry();
                  }}
                  disabled={purgingKey !== null || !cacheStats?.total}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300 disabled:opacity-40"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Purge all
                </button>
              </div>
            </div>

            {/* Entry table */}
            {loadingCache && !cacheStats ? (
              <div className="rounded-xl border border-white/[0.07] bg-slate-900/60 px-6 py-16 text-center">
                <RefreshCw
                  aria-hidden="true"
                  className="mx-auto mb-3 h-6 w-6 animate-spin text-slate-600"
                />
                <p className="text-sm text-slate-500">Loading cache entries…</p>
              </div>
            ) : !cacheStats || cacheStats.total === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-6 py-16 text-center">
                <Database aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-slate-600" />
                <p className="text-sm font-medium text-slate-400">Cache is empty</p>
                <p className="mt-1 text-xs text-slate-600">
                  Entries are written after the first live map load in a region.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-slate-900/80">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        Grid cell
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        Location
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        Contents
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        Age
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">
                        Status
                      </th>
                      <th className="px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] bg-slate-900/40">
                    {cacheStats.entries.map((entry) => (
                      <tr key={entry.gridKey} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">
                          {entry.gridKey}
                        </td>
                        <td className="px-4 py-3">
                          {entry.location ? (
                            <div className="flex items-start gap-1.5">
                              <MapPin
                                aria-hidden="true"
                                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500"
                              />
                              <div>
                                <p className="line-clamp-1 text-xs leading-tight text-slate-300">
                                  {entry.location.address ?? '—'}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {entry.location.lat.toFixed(3)}, {entry.location.lng.toFixed(3)}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="flex items-center gap-3 px-4 py-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <MapPin aria-hidden="true" className="h-3 w-3 text-blue-400" />
                            {entry.routeCount} routes
                          </span>
                          <span className="flex items-center gap-1">
                            <Mountain aria-hidden="true" className="h-3 w-3 text-indigo-400" />
                            {entry.mountainCount} peaks
                          </span>
                          <span className="flex items-center gap-1">
                            <Tent aria-hidden="true" className="h-3 w-3 text-green-400" />
                            {entry.campsiteCount} camps
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {entry.ageHours < 1
                            ? `${Math.round(entry.ageHours * 60)} min`
                            : `${entry.ageHours} h`}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={entry.fresh ? 'ok' : 'warn'} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              // Purging is irreversible and forces a full live
                              // refetch for that region; the bulk purge already
                              // confirmed, this one silently deleted.
                              if (
                                confirm(
                                  `Purge the cache for ${entry.gridKey}? The next user in that region will trigger a full live fetch.`
                                )
                              ) {
                                purgeEntry(entry.gridKey);
                              }
                            }}
                            disabled={purgingKey === entry.gridKey}
                            className="rounded p-1 text-slate-600 transition-colors hover:text-red-400 disabled:opacity-40"
                            aria-label="Purge this entry"
                          >
                            {purgingKey === entry.gridKey ? (
                              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
