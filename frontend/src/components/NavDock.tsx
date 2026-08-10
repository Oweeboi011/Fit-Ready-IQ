'use client';

import {
  Activity,
  Bell,
  Bookmark,
  CalendarRange,
  CloudSun,
  Compass,
  Layers,
  Mountain,
  Newspaper,
  Route,
  Tent,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlertsPanel,
  LayersPanel,
  LinksPanel,
  PanelShell,
  PulsePanel,
  WeatherPanel,
  type DockAlert,
  type DockWeather,
  type TerrainPulse,
} from '@/components/dock/panels';
import { AdvisoriesPanel } from '@/components/dock/AdvisoriesPanel';
import type { Advisory } from '@/lib/advisories';
import { MAP_LAYERS, type MapLayer } from '@/lib/mapLayers';

export type { DockAlert, DockWeather, TerrainPulse };

/** Panels that open in place; Planner and Fitness hand off to existing surfaces. */
type DockPanel = 'weather' | 'pulse' | 'alerts' | 'links' | 'layers' | 'advisories';
type DockItemId = DockPanel | 'planner' | 'fitness';

/** The lists the sidebar can show. Kept in the dock so the map is not a dead end. */
export type ContentTab = 'routes' | 'mountains' | 'campsites' | 'saved';

const CONTENT_TABS: { id: ContentTab; label: string; Icon: LucideIcon }[] = [
  { id: 'routes', label: 'Routes', Icon: Route },
  { id: 'mountains', label: 'Peaks', Icon: Mountain },
  { id: 'campsites', label: 'Camps', Icon: Tent },
  { id: 'saved', label: 'Saved', Icon: Bookmark },
];

interface NavDockProps {
  areaLabel: string | null;
  savedCount: number;
  isSignedIn: boolean;
  isAdmin: boolean;
  alerts: DockAlert[];
  pulse: TerrainPulse;
  weather: DockWeather;
  legendVisible: boolean;
  nativeControlsVisible: boolean;
  nativePoiVisible: boolean;
  activeTab: ContentTab | string;
  tabCounts: Record<ContentTab, number>;
  hiddenLayers: MapLayer[];
  advisories: Advisory[];
  advisorySource: { configured: boolean; status: 'idle' | 'loading' | 'error' };
  onSelectAdvisory: (advisory: Advisory) => void;
  layerCounts: Record<MapLayer, number>;
  weatherRadarVisible: boolean;
  onSelectTab: (tab: ContentTab) => void;
  onToggleLayer: (layer: MapLayer) => void;
  onToggleWeatherRadar: () => void;
  onRequestWeather: () => void;
  onOpenPlanner: () => void;
  onOpenFitness: () => void;
  onOpenConnectDevices: () => void;
  onToggleLegend: () => void;
  onToggleNativeControls: () => void;
  onToggleNativePoi: () => void;
  onOpenAdmin: () => void;
  onOpenRoadmap: () => void;
  onLocate: () => void;
}

const ITEMS: { id: DockItemId; label: string; Icon: LucideIcon }[] = [
  { id: 'planner', label: 'Planner', Icon: CalendarRange },
  { id: 'weather', label: 'Weather', Icon: CloudSun },
  { id: 'fitness', label: 'Fitness', Icon: Activity },
  { id: 'pulse', label: 'Terrain', Icon: Mountain },
  { id: 'advisories', label: 'News', Icon: Newspaper },
  { id: 'alerts', label: 'Alerts', Icon: Bell },
  { id: 'layers', label: 'Layers', Icon: Layers },
  { id: 'links', label: 'More', Icon: Compass },
];

/** Renders whichever panel is open. Split out to keep NavDock readable. */
function DockPanelBody({
  panel,
  props,
  close,
}: {
  panel: DockPanel;
  props: NavDockProps;
  close: () => void;
}) {
  switch (panel) {
    case 'weather':
      return <WeatherPanel weather={props.weather} />;
    case 'pulse':
      return <PulsePanel pulse={props.pulse} />;
    case 'alerts':
      return <AlertsPanel alerts={props.alerts} />;
    case 'advisories':
      return (
        <AdvisoriesPanel
          advisories={props.advisories}
          configured={props.advisorySource.configured}
          status={props.advisorySource.status}
          onSelect={(a) => {
            close();
            props.onSelectAdvisory(a);
          }}
        />
      );
    case 'layers':
      return (
        <LayersPanel
          hiddenLayers={props.hiddenLayers}
          counts={props.layerCounts}
          onToggle={props.onToggleLayer}
          weatherRadarVisible={props.weatherRadarVisible}
          onToggleWeatherRadar={props.onToggleWeatherRadar}
        />
      );
    case 'links':
      return (
        <LinksPanel
          isAdmin={props.isAdmin}
          legendVisible={props.legendVisible}
          nativeControlsVisible={props.nativeControlsVisible}
          nativePoiVisible={props.nativePoiVisible}
          onConnectDevices={() => {
            close();
            props.onOpenConnectDevices();
          }}
          onLocate={() => {
            close();
            props.onLocate();
          }}
          onToggleLegend={props.onToggleLegend}
          onToggleNativeControls={props.onToggleNativeControls}
          onToggleNativePoi={props.onToggleNativePoi}
          onOpenAdmin={() => {
            close();
            props.onOpenAdmin();
          }}
          onOpenRoadmap={() => {
            close();
            props.onOpenRoadmap();
          }}
        />
      );
  }
}

/** Advisory kinds that warrant a badge; announcements should not nag. */
const URGENT_KINDS = new Set(['closure', 'emergency', 'rescue', 'hazard']);

function badgeFor(
  id: DockItemId,
  ctx: {
    hiddenLayers: MapLayer[];
    pulse: TerrainPulse;
    alerts: DockAlert[];
    advisories: Advisory[];
  }
): number | undefined {
  switch (id) {
    case 'layers':
      return ctx.hiddenLayers.length || undefined;
    case 'pulse':
      return ctx.pulse.peaks;
    case 'alerts':
      return ctx.alerts.length;
    case 'advisories':
      return ctx.advisories.filter((a) => URGENT_KINDS.has(a.kind)).length;
    default:
      return undefined;
  }
}

/** A single dock button. Content tabs and feature buttons look identical. */
function DockButton({
  label,
  Icon,
  active,
  badge,
  badgeTone,
  expanded,
  onClick,
  children,
}: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  badge?: number;
  badgeTone?: 'default' | 'warning';
  expanded?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      className={`relative flex min-h-11 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
          : 'text-slate-400 hover:bg-white/[0.08] hover:text-white'
      }`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span className="text-[10px] font-semibold leading-none">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`absolute -right-0.5 -top-0.5 min-w-4 rounded-full px-1 text-[9px] font-bold leading-4 ${
            badgeTone === 'warning'
              ? 'bg-amber-500 text-slate-950'
              : active
                ? 'bg-white/25 text-white'
                : 'bg-white/10 text-slate-300'
          }`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {children}
    </button>
  );
}

/**
 * The dock over the map.
 *
 * Map controls used to be scattered into all four corners, and the things a
 * returning user actually comes back for — their shortlist, the forecast, their
 * training — were buried behind a hamburger or reachable only from a modal.
 *
 * Every item is backed by data the app already holds. Nothing here opens a
 * "coming soon" panel, because unwired controls are the exact problem this
 * codebase had too much of.
 */
export function NavDock(props: NavDockProps) {
  // Destructured for the bar itself; the panels take `props` wholesale.
  const {
    areaLabel,
    savedCount,
    isSignedIn,
    alerts,
    pulse,
    advisories,
    hiddenLayers,
    activeTab,
    tabCounts,
    onSelectTab,
    onRequestWeather,
    onOpenPlanner,
    onOpenFitness,
  } = props;
  const [open, setOpen] = useState<DockPanel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(null), []);

  // Escape closes, and so does a click outside — a panel pinned over the map
  // with no way out would be worse than no panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, close]);

  function handleSelect(id: DockItemId) {
    if (id === 'fitness' || id === 'planner') {
      close();
      (id === 'fitness' ? onOpenFitness : onOpenPlanner)();
      return;
    }
    if (id === 'weather' && open !== 'weather') onRequestWeather();
    setOpen((current) => (current === id ? null : id));
  }

  const panelTitle: Record<DockPanel, string> = {
    weather: areaLabel ? `Weather · ${areaLabel}` : 'Weather',
    pulse: 'Terrain pulse',
    advisories: 'Mountain news',
    alerts: 'Alerts',
    layers: 'Map layers',
    links: 'Quick links',
  };

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex flex-col items-center px-4"
    >
      {open && (
        <div className="pointer-events-auto">
          <PanelShell title={panelTitle[open]} onClose={close}>
            <DockPanelBody panel={open} props={props} close={close} />
          </PanelShell>
        </div>
      )}

      <div
        role="toolbar"
        aria-label="Navigation dock"
        className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/90 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
      >
        {CONTENT_TABS.map(({ id, label, Icon }) => (
          <DockButton
            key={id}
            label={label}
            Icon={Icon}
            active={activeTab === id}
            badge={tabCounts[id]}
            onClick={() => onSelectTab(id)}
          />
        ))}

        <div aria-hidden="true" className="mx-1 h-8 w-px flex-shrink-0 bg-white/10" />

        {ITEMS.map(({ id, label, Icon }) => (
          <DockButton
            key={id}
            label={label}
            Icon={Icon}
            active={open === id}
            badge={badgeFor(id, { hiddenLayers, pulse, alerts, advisories })}
            badgeTone={id === 'alerts' || id === 'advisories' ? 'warning' : 'default'}
            expanded={id === 'planner' || id === 'fitness' ? undefined : open === id}
            onClick={() => handleSelect(id)}
          >
            {id === 'planner' && !isSignedIn && <span className="sr-only">Sign in required</span>}
          </DockButton>
        ))}
      </div>
    </div>
  );
}
