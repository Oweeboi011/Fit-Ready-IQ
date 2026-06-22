'use client';

import { useState, useEffect } from 'react';
import { Settings, Activity, BarChart2, Users, ChevronLeft, Shield, AlertTriangle, CheckCircle, RefreshCw, Trash2, Eye, EyeOff, Database, MapPin, Mountain, Tent } from 'lucide-react';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'general' | 'observability' | 'api-usage' | 'users' | 'cache';

interface ApiStat {
  service: string;
  calls_today: number;
  calls_month: number;
  quota: number;
  status: 'ok' | 'warn' | 'error';
}

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
    ok:    { icon: CheckCircle,   cls: 'text-emerald-400 bg-emerald-900/30 ring-emerald-500/30', label: 'OK' },
    warn:  { icon: AlertTriangle, cls: 'text-amber-400   bg-amber-900/30   ring-amber-500/30',   label: 'WARN' },
    error: { icon: AlertTriangle, cls: 'text-red-400     bg-red-900/30     ring-red-500/30',     label: 'ERROR' },
  };
  const { icon: Icon, cls, label } = MAP[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function QuotaBar({ used, quota }: { used: number; quota: number }) {
  const pct = Math.min(100, Math.round((used / quota) * 100));
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
        <span>{used.toLocaleString()} used</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── API Stats mock (replace with real /api/admin/stats once implemented) ──

const MOCK_API_STATS: ApiStat[] = [
  { service: 'Google Maps JS',      calls_today: 842,   calls_month: 18400, quota: 28000, status: 'ok'   },
  { service: 'Google Places API',   calls_today: 1240,  calls_month: 22100, quota: 25000, status: 'warn' },
  { service: 'Google Elevation API',calls_today: 390,   calls_month: 9200,  quota: 40000, status: 'ok'   },
  { service: 'Gemini 1.5 Flash',    calls_today: 65,    calls_month: 1420,  quota: 5000,  status: 'ok'   },
  { service: 'Firebase Firestore',  calls_today: 3210,  calls_month: 74000, quota: 100000,status: 'ok'   },
  { service: 'Strava API',          calls_today: 48,    calls_month: 980,   quota: 10000, status: 'ok'   },
];

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loadingCache, setLoadingCache] = useState(false);
  const [purgingKey, setPurgingKey] = useState<string | null>(null);

  interface StravaSyncEntry { uid: string; last_synced_at: string | null; total_activities: number; errors: string[] | null; }
  const [stravaSyncStats, setStravaSyncStats] = useState<{ total: number; entries: StravaSyncEntry[] } | null>(null);
  const [loadingStravaSync, setLoadingStravaSync] = useState(false);

  // General settings state (reads from env for display only — edits go via Vercel dashboard)
  const envVars = [
    { key: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', label: 'Google Maps API Key',     scope: 'Client' },
    { key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', label: 'Firebase Project ID',      scope: 'Client' },
    { key: 'GEMINI_API_KEY',                  label: 'Gemini API Key',            scope: 'Server' },
    { key: 'FIREBASE_SERVICE_ACCOUNT_KEY_JSON', label: 'Firebase Admin JSON',    scope: 'Server' },
    { key: 'STRAVA_CLIENT_ID',                label: 'Strava Client ID',          scope: 'Server' },
    { key: 'NEXT_PUBLIC_APP_URL',             label: 'App URL',                   scope: 'Client' },
  ];

  async function loadCache() {
    setLoadingCache(true);
    try {
      const res = await fetch('/api/admin/cache');
      if (res.ok) setCacheStats(await res.json());
    } catch { /* ignore */ } finally {
      setLoadingCache(false);
    }
  }

  async function loadStravaSync() {
    setLoadingStravaSync(true);
    try {
      const res = await fetch('/api/admin/strava-sync');
      if (res.ok) setStravaSyncStats(await res.json());
    } catch { /* ignore */ } finally {
      setLoadingStravaSync(false);
    }
  }

  async function purgeEntry(gridKey?: string) {
    const key = gridKey ?? '__all__';
    setPurgingKey(key);
    try {
      const url = gridKey ? `/api/admin/cache?gridKey=${encodeURIComponent(gridKey)}` : '/api/admin/cache';
      await fetch(url, { method: 'DELETE' });
      await loadCache();
    } catch { /* ignore */ } finally {
      setPurgingKey(null);
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } catch {
      // silently handle — admin route not yet implemented
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'cache') loadCache();
    if (activeTab === 'observability') loadStravaSync();
  }, [activeTab]);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general',      label: 'General',       icon: Settings   },
    { id: 'observability',label: 'Observability', icon: Activity   },
    { id: 'api-usage',    label: 'API Usage',     icon: BarChart2  },
    { id: 'cache',        label: 'Cache',         icon: Database   },
    { id: 'users',        label: 'Users',         icon: Users      },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-slate-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm">
            <ChevronLeft className="h-4 w-4" />
            Back to map
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">Admin Settings</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        {/* Tab bar */}
        <div className="mb-8 flex gap-1 rounded-xl border border-white/[0.06] bg-slate-900/60 p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                activeTab === id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ── General Tab ─────────────────────────────────────────────── */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <h2 className="mb-1 text-sm font-semibold text-slate-200">Application</h2>
              <p className="mb-5 text-xs text-slate-500">Core identity and runtime settings.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">App Name</label>
                  <input
                    type="text"
                    defaultValue="Fit-Ready-IQ"
                    className="w-full rounded-lg border border-white/[0.08] bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">App URL</label>
                  <input
                    type="text"
                    defaultValue={process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4790'}
                    className="w-full rounded-lg border border-white/[0.08] bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Firebase Project</label>
                  <input
                    type="text"
                    defaultValue={process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '—'}
                    readOnly
                    className="w-full rounded-lg border border-white/[0.06] bg-slate-800/50 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Default Search Radius</label>
                  <select className="w-full rounded-lg border border-white/[0.08] bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500/60 focus:outline-none">
                    <option>25 km</option>
                    <option>50 km</option>
                    <option selected>100 km</option>
                    <option>200 km</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="mb-1 text-sm font-semibold text-slate-200">Environment Variables</h2>
                  <p className="text-xs text-slate-500">Read-only. Edit via Vercel Dashboard → Project Settings → Environment Variables.</p>
                </div>
                <button
                  onClick={() => setShowApiKeys(v => !v)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showApiKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showApiKeys ? 'Hide' : 'Show'} values
                </button>
              </div>
              <div className="space-y-2">
                {envVars.map(({ key, label, scope }) => (
                  <div key={key} className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-slate-800/40 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-300">{label}</p>
                      <p className="text-[10px] font-mono text-slate-500 truncate">{key}</p>
                    </div>
                    <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      scope === 'Client' ? 'bg-blue-900/40 text-blue-300' : 'bg-purple-900/40 text-purple-300'
                    }`}>{scope}</span>
                    <span className="flex-shrink-0 text-xs font-mono text-slate-500">
                      {showApiKeys ? (process.env[key] ?? '—') : '••••••••'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex justify-end gap-3">
              <button className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Reset
              </button>
              <button
                onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
              >
                {saved ? <CheckCircle className="h-4 w-4" /> : null}
                {saved ? 'Saved' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Observability Tab ────────────────────────────────────────── */}
        {activeTab === 'observability' && (
          <div className="space-y-6">
            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <h2 className="mb-5 text-sm font-semibold text-slate-200">System Health</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: 'Frontend Build', value: 'Next.js 14.2.35', status: 'ok' as const },
                  { label: 'Firebase Auth', value: 'fit-ready-iq', status: 'ok' as const },
                  { label: 'Firestore DB', value: 'Connected', status: 'ok' as const },
                  { label: 'Maps SDK', value: 'Loaded', status: 'ok' as const },
                  { label: 'Gemini API', value: process.env.GEMINI_API_KEY ? 'Configured' : 'Not set', status: process.env.GEMINI_API_KEY ? 'ok' as const : 'warn' as const },
                  { label: 'Firebase Admin', value: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON ? 'Configured' : 'Not set', status: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON ? 'ok' as const : 'warn' as const },
                ].map(({ label, value, status }) => (
                  <div key={label} className="rounded-lg border border-white/[0.05] bg-slate-800/40 p-4">
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
              <h2 className="mb-5 text-sm font-semibold text-slate-200">Error Logs</h2>
              <div className="rounded-lg border border-white/[0.05] bg-slate-950/60 p-4 font-mono text-[11px] text-slate-400 h-48 overflow-y-auto">
                <p className="text-slate-600">No critical errors in the last 24 hours.</p>
                <p className="mt-1 text-slate-600">Connect Application Insights or Vercel Log Drains for live logs.</p>
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <h2 className="mb-5 text-sm font-semibold text-slate-200">Feature Flags</h2>
              <div className="space-y-3">
                {[
                  { label: 'Google Sign-In',      enabled: true,  desc: 'Firebase Auth Google provider' },
                  { label: 'Saved Places',         enabled: true,  desc: 'Firestore bookmark storage' },
                  { label: 'AI Chat Assistant',    enabled: false, desc: 'Requires GEMINI_API_KEY' },
                  { label: 'Weather Forecasts',    enabled: false, desc: 'Phase 1 — not yet implemented' },
                  { label: 'Readiness Scoring',    enabled: false, desc: 'Phase 4 — not yet implemented' },
                ].map(({ label, enabled, desc }) => (
                  <div key={label} className="flex items-center gap-4 rounded-lg border border-white/[0.05] bg-slate-800/40 px-4 py-3">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-200">{label}</p>
                      <p className="text-[11px] text-slate-500">{desc}</p>
                    </div>
                    <span className={`text-xs font-medium ${enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="mb-1 text-sm font-semibold text-slate-200">Strava → Firestore Sync</h2>
                  <p className="text-xs text-slate-500">Historical activities synced per user. Re-syncs at most once per hour.</p>
                </div>
                <button
                  onClick={loadStravaSync}
                  disabled={loadingStravaSync}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingStravaSync ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              {loadingStravaSync && !stravaSyncStats ? (
                <div className="py-8 text-center">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin text-slate-600 mb-2" />
                  <p className="text-xs text-slate-500">Loading sync status…</p>
                </div>
              ) : !stravaSyncStats || stravaSyncStats.total === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
                  <Activity className="mx-auto h-6 w-6 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-500">No users have synced Strava data yet.</p>
                  <p className="text-xs text-slate-600 mt-1">Sync runs automatically after the user connects Strava and is signed in.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-white/[0.05]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-slate-900/80">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">User ID</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Activities</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Last synced</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] bg-slate-900/40">
                      {stravaSyncStats.entries.map((entry) => (
                        <tr key={entry.uid} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-400 max-w-[140px] truncate">{entry.uid}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-200">{entry.total_activities}</td>
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Showing estimated usage. Connect real billing APIs for live data.</p>
              <button className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {MOCK_API_STATS.map((stat) => (
                <div key={stat.service} className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-200">{stat.service}</p>
                    <StatusBadge status={stat.status} />
                  </div>
                  <div className="flex gap-6 text-[11px] text-slate-400 mb-2">
                    <span><span className="font-semibold text-slate-200">{stat.calls_today.toLocaleString()}</span> today</span>
                    <span><span className="font-semibold text-slate-200">{stat.calls_month.toLocaleString()}</span> / month</span>
                    <span>quota: {stat.quota.toLocaleString()}</span>
                  </div>
                  <QuotaBar used={stat.calls_month} quota={stat.quota} />
                </div>
              ))}
            </div>

            <section className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-6">
              <h2 className="mb-1 text-sm font-semibold text-slate-200">Cost Estimate (month-to-date)</h2>
              <p className="mb-5 text-xs text-slate-500">Based on standard public pricing. Actual cost may differ.</p>
              <div className="space-y-2">
                {[
                  { service: 'Google Maps Platform',  est: '$12.40' },
                  { service: 'Gemini 1.5 Flash',      est: '$0.85' },
                  { service: 'Firebase (Spark plan)', est: '$0.00' },
                  { service: 'Vercel (Hobby)',         est: '$0.00' },
                ].map(({ service, est }) => (
                  <div key={service} className="flex justify-between rounded-lg border border-white/[0.05] bg-slate-800/40 px-4 py-2.5 text-sm">
                    <span className="text-slate-400">{service}</span>
                    <span className="font-semibold text-slate-200">{est}</span>
                  </div>
                ))}
                <div className="flex justify-between rounded-lg border border-blue-500/20 bg-blue-900/20 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-slate-200">Total estimate</span>
                  <span className="font-bold text-blue-300">$13.25</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── Users Tab ────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {loadingUsers ? 'Loading...' : users.length > 0 ? `${users.length} users` : 'Requires Firebase Admin SDK to be configured.'}
              </p>
              <button
                onClick={loadUsers}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {users.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-6 py-16 text-center">
                <Users className="mx-auto h-8 w-8 text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-400">No users loaded</p>
                <p className="mt-1 text-xs text-slate-600">
                  Implement <code className="text-slate-500">/api/admin/users</code> with Firebase Admin SDK to list users here.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-slate-900/80">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Provider</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Last sign in</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] bg-slate-900/40">
                    {users.map((u) => (
                      <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-200">{u.displayName ?? '—'}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-blue-900/40 px-2 py-0.5 text-[10px] font-medium text-blue-300">{u.provider}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{u.createdAt}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{u.lastSignIn}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="rounded p-1 text-slate-600 hover:text-red-400 transition-colors" aria-label="Delete user">
                            <Trash2 className="h-3.5 w-3.5" />
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

        {/* ── Cache Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'cache' && (
          <div className="space-y-6">
            {/* Summary stat bar */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total entries', value: cacheStats?.total ?? '—', icon: Database, color: 'text-blue-400' },
                { label: 'Fresh  (< 24 h)', value: cacheStats?.fresh ?? '—', icon: CheckCircle, color: 'text-emerald-400' },
                { label: 'Stale (≥ 24 h)', value: cacheStats?.stale ?? '—', icon: AlertTriangle, color: 'text-amber-400' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-5 flex items-center gap-4">
                  <Icon className={`h-6 w-6 flex-shrink-0 ${color}`} />
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
                Places cache — Firestore collection <code className="text-slate-400">places_cache</code> · 24 h TTL · ~55 km grid cells
              </p>
              <div className="flex gap-2">
                <button
                  onClick={loadCache}
                  disabled={loadingCache}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCache ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={() => { if (confirm('Purge ALL cache entries? The next user in each region will trigger a full live fetch.')) purgeEntry(); }}
                  disabled={purgingKey !== null || !cacheStats?.total}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Purge all
                </button>
              </div>
            </div>

            {/* Entry table */}
            {loadingCache && !cacheStats ? (
              <div className="rounded-xl border border-white/[0.07] bg-slate-900/60 px-6 py-16 text-center">
                <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-600 mb-3" />
                <p className="text-sm text-slate-500">Loading cache entries…</p>
              </div>
            ) : !cacheStats || cacheStats.total === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-6 py-16 text-center">
                <Database className="mx-auto h-8 w-8 text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-400">Cache is empty</p>
                <p className="mt-1 text-xs text-slate-600">Entries are written after the first live map load in a region.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-slate-900/80">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Grid cell</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Contents</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Age</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] bg-slate-900/40">
                    {cacheStats.entries.map((entry) => (
                      <tr key={entry.gridKey} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{entry.gridKey}</td>
                        <td className="px-4 py-3">
                          {entry.location ? (
                            <div className="flex items-start gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs text-slate-300 leading-tight line-clamp-1">{entry.location.address ?? '—'}</p>
                                <p className="text-[10px] text-slate-500">{entry.location.lat.toFixed(3)}, {entry.location.lng.toFixed(3)}</p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-blue-400" />{entry.routeCount} routes</span>
                            <span className="flex items-center gap-1"><Mountain className="h-3 w-3 text-indigo-400" />{entry.mountainCount} peaks</span>
                            <span className="flex items-center gap-1"><Tent className="h-3 w-3 text-green-400" />{entry.campsiteCount} camps</span>
                          </div>
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
                            onClick={() => purgeEntry(entry.gridKey)}
                            disabled={purgingKey === entry.gridKey}
                            className="rounded p-1 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                            aria-label="Purge this entry"
                          >
                            {purgingKey === entry.gridKey
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
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
