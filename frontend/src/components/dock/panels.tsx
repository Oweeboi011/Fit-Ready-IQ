'use client';

import { Eye, EyeOff, X } from 'lucide-react';
import Link from 'next/link';

import { MAP_LAYERS, MAP_LAYER_LABELS, MAP_LAYER_SWATCH, type MapLayer } from '@/lib/mapLayers';
import { buttonGhost, buttonSecondary, buttonSize } from '@/lib/ui';

export interface DockAlert {
  id: string;
  message: string;
  tone: 'warning' | 'info';
}

export interface TerrainPulse {
  peaks: number;
  routes: number;
  campsites: number;
  highestName: string | null;
  highestElevation: number | null;
  nearestName: string | null;
  nearestKm: number | null;
}

export interface DockWeather {
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  temp?: string;
  best?: string;
  avoid?: string;
  risk?: string;
}

export function PanelShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-2 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right text-xs font-semibold text-white">{value}</span>
    </div>
  );
}

export function WeatherPanel({ weather }: { weather: DockWeather }) {
  if (weather.status === 'loading') {
    return (
      <p role="status" className="py-2 text-xs text-slate-400">
        Checking the forecast…
      </p>
    );
  }
  if (weather.status !== 'ready') {
    return (
      <p className="py-2 text-xs text-amber-200">
        Forecast unavailable right now. Check a mountain forecast before you set out.
      </p>
    );
  }
  return (
    <div>
      <Row label="Temperature" value={weather.temp ?? '—'} />
      <Row label="Best window" value={weather.best ?? '—'} />
      <Row label="Avoid" value={weather.avoid ?? '—'} />
      {weather.risk && <p className="pt-2 text-[11px] text-slate-400">{weather.risk}</p>}
    </div>
  );
}

export function PulsePanel({ pulse }: { pulse: TerrainPulse }) {
  if (pulse.peaks + pulse.routes + pulse.campsites === 0) {
    return <p className="py-2 text-xs text-slate-400">Nothing loaded for this area yet.</p>;
  }
  return (
    <div>
      <Row label="Routes nearby" value={String(pulse.routes)} />
      <Row label="Peaks nearby" value={String(pulse.peaks)} />
      <Row label="Campsites nearby" value={String(pulse.campsites)} />
      {pulse.highestName && (
        <Row
          label="Highest peak"
          value={
            pulse.highestElevation == null
              ? pulse.highestName
              : `${pulse.highestName} · ${pulse.highestElevation} m`
          }
        />
      )}
      {pulse.nearestName && (
        <Row
          label="Closest route"
          value={
            pulse.nearestKm == null
              ? pulse.nearestName
              : `${pulse.nearestName} · ${pulse.nearestKm.toFixed(1)} km`
          }
        />
      )}
    </div>
  );
}

export function AlertsPanel({ alerts }: { alerts: DockAlert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="py-2 text-xs text-slate-400">
        Nothing needs your attention. Everything loaded normally.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
            alert.tone === 'warning'
              ? 'border-amber-500/25 bg-amber-500/10 text-amber-100'
              : 'border-white/10 bg-white/5 text-slate-300'
          }`}
        >
          {alert.message}
        </li>
      ))}
    </ul>
  );
}

export function LinksPanel({
  isAdmin,
  legendVisible,
  nativeControlsVisible,
  nativePoiVisible,
  onConnectDevices,
  onLocate,
  onToggleLegend,
  onToggleNativeControls,
  onToggleNativePoi,
  onOpenAdmin,
  onOpenRoadmap,
}: {
  isAdmin: boolean;
  legendVisible: boolean;
  nativeControlsVisible: boolean;
  nativePoiVisible: boolean;
  onConnectDevices: () => void;
  onLocate: () => void;
  onToggleLegend: () => void;
  onToggleNativeControls: () => void;
  onToggleNativePoi: () => void;
  onOpenAdmin: () => void;
  onOpenRoadmap: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onConnectDevices}
        className={`${buttonSecondary} ${buttonSize.sm} justify-start`}
      >
        Connect devices
      </button>
      <button
        type="button"
        onClick={onLocate}
        className={`${buttonGhost} ${buttonSize.sm} justify-start`}
      >
        Centre on my location
      </button>
      <button
        type="button"
        onClick={onToggleLegend}
        aria-pressed={legendVisible}
        className={`${buttonGhost} ${buttonSize.sm} justify-start`}
      >
        {legendVisible ? 'Hide map legend' : 'Show map legend'}
      </button>
      {/* Google's own zoom, map-type and fullscreen buttons. They occupy three
          corners, which is a lot on a phone. */}
      <button
        type="button"
        onClick={onToggleNativeControls}
        aria-pressed={nativeControlsVisible}
        className={`${buttonGhost} ${buttonSize.sm} justify-start`}
      >
        {nativeControlsVisible ? 'Hide Google controls' : 'Show Google controls'}
      </button>
      <button
        type="button"
        onClick={onToggleNativePoi}
        aria-pressed={nativePoiVisible}
        className={`${buttonGhost} ${buttonSize.sm} justify-start`}
      >
        {nativePoiVisible ? 'Hide Google place pins' : 'Show Google place pins'}
      </button>
      <button
        type="button"
        onClick={onOpenRoadmap}
        className={`${buttonGhost} ${buttonSize.sm} justify-start`}
      >
        Release roadmap
      </button>
      <Link href="/" className={`${buttonGhost} ${buttonSize.sm} justify-start`}>
        About Fit Ready IQ
      </Link>
      {isAdmin && (
        <button
          type="button"
          onClick={onOpenAdmin}
          className={`${buttonGhost} ${buttonSize.sm} justify-start`}
        >
          Admin
        </button>
      )}
    </div>
  );
}

export function LayersPanel({
  hiddenLayers,
  counts,
  onToggle,
}: {
  hiddenLayers: MapLayer[];
  counts: Record<MapLayer, number>;
  onToggle: (layer: MapLayer) => void;
}) {
  return (
    <div className="space-y-0.5">
      {MAP_LAYERS.map((layer) => {
        const visible = !hiddenLayers.includes(layer);
        const count = counts[layer];
        return (
          <button
            key={layer}
            type="button"
            onClick={() => onToggle(layer)}
            aria-pressed={visible}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              visible ? 'text-white' : 'text-slate-500'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${MAP_LAYER_SWATCH[layer]} ${
                visible ? '' : 'opacity-25'
              }`}
            />
            <span className="flex-1 truncate">{MAP_LAYER_LABELS[layer]}</span>
            {/* The count is what tells you whether a hidden layer is worth
                turning back on. */}
            <span className="font-tabular flex-shrink-0 text-[11px] text-slate-500">{count}</span>
            {visible ? (
              <Eye aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            ) : (
              <EyeOff aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            )}
          </button>
        );
      })}
    </div>
  );
}
