'use client';

import { AlertTriangle, CheckCircle2, Circle, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import ElevationProfile from '@/components/ElevationProfile';
import Modal from '@/components/Modal';
import { WeatherWindowPanel } from '@/components/WeatherWindowPanel';
import type { KomootRoute } from '@/lib/komootTour';
import {
  buildBriefing,
  formatHours,
  type ChecklistItem,
  type RouteBriefing,
} from '@/lib/routeBriefing';
import { DIFFICULTY_LABELS } from '@/lib/routeDifficulty';
import { buttonGhost, buttonPrimary, buttonSize } from '@/lib/ui';
import type { WeatherWindow } from '@/lib/weatherWindow';

/**
 * Paste a Komoot tour link; get the route explained and a list of what to bring.
 *
 * The tour is read through `/api/komoot/tour`, the briefing is computed locally
 * by `routeBriefing.ts`, and the forecast comes from `/api/weather` at the start
 * point, scoped to the route's planned duration. Each of the three can fail on
 * its own and each says so — a missing forecast does not hide the route.
 */

type TourState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; route: KomootRoute };

type WeatherState =
  | { status: 'idle' | 'loading' | 'failed' | 'unconfigured' }
  | { status: 'ready'; window: WeatherWindow | null; tempC: number | null };

async function loadTour(link: string): Promise<TourState> {
  try {
    const res = await fetch(`/api/komoot/tour?url=${encodeURIComponent(link)}`);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        status: 'failed',
        message:
          res.status === 429
            ? 'Too many lookups this hour. Try again later.'
            : (json?.error ?? 'Komoot did not answer. Try again in a minute.'),
      };
    }
    return { status: 'ready', route: json as KomootRoute };
  } catch {
    return { status: 'failed', message: 'Could not reach the server. Check your connection.' };
  }
}

/** The forecast at the start, for as long as the route takes. */
function useRouteWeather(route: KomootRoute | null, hours: number | null, startM: number | null) {
  const [state, setState] = useState<WeatherState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!route) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets to idle when the route goes away
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    const url =
      `/api/weather?lat=${route.start.lat.toFixed(2)}&lng=${route.start.lng.toFixed(2)}` +
      `${startM != null ? `&elevation=${startM}` : ''}` +
      `${hours != null ? `&hours=${Math.min(240, Math.ceil(hours))}` : ''}`;
    fetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 503) return setState({ status: 'unconfigured' });
        const json = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (!json || json.error) return setState({ status: 'failed' });
        setState({
          status: 'ready',
          window: json.window ?? null,
          tempC: typeof json.current?.tempC === 'number' ? json.current.tempC : null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [route, hours, startM, attempt]);

  return { weather: state, retry: () => setAttempt((n) => n + 1) };
}

/** The route's shape, drawn from its own coordinates — no map tiles, no extra calls. */
function RouteOutline({ path }: { path: [number, number][] }) {
  const d = useMemo(() => {
    const lngs = path.map((p) => p[0]);
    const lats = path.map((p) => p[1]);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    // Longitude degrees shrink with latitude; without this the route is stretched east-west.
    const kx = Math.cos((midLat * Math.PI) / 180);
    const minX = Math.min(...lngs) * kx;
    const maxY = Math.max(...lats);
    const span = Math.max(Math.max(...lngs) * kx - minX, maxY - Math.min(...lats), 1e-6);
    const scale = 180 / span;
    const pts = path.map(([lng, lat]) => [
      10 + (lng * kx - minX) * scale,
      10 + (maxY - lat) * scale,
    ]);
    return {
      line: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '),
      start: pts[0],
      end: pts[pts.length - 1],
    };
  }, [path]);

  return (
    <svg
      viewBox="0 0 200 200"
      className="bg-ink/3 h-40 w-full rounded-lg"
      role="img"
      aria-label="Route outline-solid"
    >
      <path
        d={d.line}
        fill="none"
        stroke="#16a34a"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={d.end[0]} cy={d.end[1]} r={4} fill="#f43f5e" />
      <circle
        cx={d.start[0]}
        cy={d.start[1]}
        r={4}
        fill="#22c55e"
        stroke="white"
        strokeWidth={1.5}
      />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-ink/10 bg-ink/3 rounded-lg border px-3 py-2">
      <div className="text-[10px] tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Stats({ route, briefing }: { route: KomootRoute; briefing: RouteBriefing }) {
  const dash = '—';
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Distance" value={`${route.distanceKm.toFixed(1)} km`} />
      <Stat label="Ascent" value={route.ascentM != null ? `${route.ascentM} m` : dash} />
      <Stat
        label="Planned time"
        value={briefing.plannedHours != null ? formatHours(briefing.plannedHours) : dash}
      />
      <Stat label="Difficulty" value={DIFFICULTY_LABELS[briefing.difficulty]} />
    </div>
  );
}

function Checklist({ items }: { items: ChecklistItem[] }) {
  // Ticks are for the person packing, on this screen; nothing is stored.
  const [done, setDone] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => {
        const checked = done.has(item.id);
        const Icon = checked ? CheckCircle2 : Circle;
        return (
          <li key={item.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(item.id)}
              className="border-ink/10 bg-ink/2 hover:bg-ink/5 flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-hidden"
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${checked ? 'text-emerald-400' : 'text-slate-500'}`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span
                  className={`flex items-center gap-2 text-sm font-medium ${checked ? 'text-slate-500 line-through' : 'text-slate-100'}`}
                >
                  {item.label}
                  {item.priority === 'essential' && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
                      Essential
                    </span>
                  )}
                </span>
                <span className="block text-xs leading-relaxed text-slate-400">{item.why}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function WeatherSection({ weather, onRetry }: { weather: WeatherState; onRetry: () => void }) {
  if (weather.status === 'loading' || weather.status === 'idle') {
    return <div className="skeleton h-16 w-full rounded-lg" aria-hidden="true" />;
  }
  if (weather.status === 'ready') return <WeatherWindowPanel window={weather.window} />;
  if (weather.status === 'unconfigured') {
    return (
      <p className="text-xs text-slate-500">
        No weather provider is configured, so there is no forecast for this route.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-xs text-slate-400">
      The forecast for the start point failed to load.
      <button type="button" onClick={onRetry} className={`${buttonGhost} ${buttonSize.sm}`}>
        Retry
      </button>
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function RouteView({ route }: { route: KomootRoute }) {
  // A first pass without weather sizes the forecast request; the second folds
  // the forecast back in (temperature for water, rain for the shell).
  const base = useMemo(() => buildBriefing(route), [route]);
  const startM = base.samples[0]?.elevationM ?? null;
  const { weather, retry } = useRouteWeather(route, base.plannedHours, startM);
  const briefing = useMemo(
    () =>
      weather.status === 'ready'
        ? buildBriefing(route, { window: weather.window, tempC: weather.tempC })
        : base,
    [route, base, weather]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{route.name}</h2>
        <a
          href={route.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonGhost} ${buttonSize.sm} shrink-0`}
        >
          Open in Komoot <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
      <Stats route={route} briefing={briefing} />
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <RouteOutline path={route.path} />
        <ElevationProfile samples={briefing.samples} />
      </div>
      <Section title="The route">
        {briefing.summary.map((line) => (
          <p key={line} className="text-sm leading-relaxed text-slate-300">
            {line}
          </p>
        ))}
      </Section>
      <Section title="When to go">
        <WeatherSection weather={weather} onRetry={retry} />
      </Section>
      <Section title="What to prepare">
        <Checklist key={route.id} items={briefing.checklist} />
        <p className="text-[11px] leading-relaxed text-slate-500">
          Worked out from the route&apos;s distance, climbing, altitude and surfaces. It is a
          starting point, not a substitute for local knowledge or current conditions.
        </p>
      </Section>
    </div>
  );
}

export default function KomootRouteModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [link, setLink] = useState('');
  const [tour, setTour] = useState<TourState>({ status: 'idle' });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!link.trim()) return;
    setTour({ status: 'loading' });
    setTour(await loadTour(link));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Komoot route viewer" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-5 p-5">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="komoot-link" className="sr-only">
            Komoot tour link
          </label>
          <input
            id="komoot-link"
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.komoot.com/tour/…"
            className="border-ink/15 bg-ink/3 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400"
          />
          <button
            type="submit"
            disabled={tour.status === 'loading' || !link.trim()}
            className={`${buttonPrimary} ${buttonSize.md}`}
          >
            {tour.status === 'loading' && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Explain route
          </button>
        </form>

        {tour.status === 'idle' && (
          <p className="text-xs leading-relaxed text-slate-500">
            In Komoot, open a tour and choose Share → Copy link. Public tours work as they are; for
            a private one, use a share link (it carries a share token).
          </p>
        )}
        {tour.status === 'failed' && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.07] px-3 py-2 text-sm text-rose-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {tour.message}
          </p>
        )}
        {tour.status === 'ready' && <RouteView route={tour.route} />}
      </div>
    </Modal>
  );
}
