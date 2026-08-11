'use client';

import { TriangleAlert } from 'lucide-react';
import { WEATHER_ALERT_LABELS, type WeatherAlert } from '@/lib/weatherAlerts';
import { useWeatherAlertsNear } from '@/lib/weatherAlertCache';

const SEVERITY_STYLES: Record<WeatherAlert['severity'], string> = {
  warning: 'bg-red-500/15 text-red-300 border-red-500/30',
  watch: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

function worst(alerts: WeatherAlert[]): WeatherAlert {
  return alerts.reduce((w, a) => (a.severity === 'warning' && w.severity === 'watch' ? a : w));
}

/** Compact pill for a route/mountain/campsite card — the worst hazard in the next 48h. */
export function WeatherAlertBadge({ alerts }: { alerts: WeatherAlert[] }) {
  if (alerts.length === 0) return null;
  const lead = worst(alerts);
  const label =
    alerts.length > 1
      ? `${WEATHER_ALERT_LABELS[lead.kind]} +${alerts.length - 1}`
      : WEATHER_ALERT_LABELS[lead.kind];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLES[lead.severity]}`}
      title={alerts.map((a) => `${WEATHER_ALERT_LABELS[a.kind]}: ${a.summary}`).join(' · ')}
    >
      <TriangleAlert aria-hidden="true" className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * `WeatherAlertBadge` for a card in a list. Wrapping the hook in its own
 * component (rather than calling `useWeatherAlertsNear` inline inside a
 * `.map()`) keeps hook-call order stable regardless of how many cards render.
 */
export function WeatherAlertBadgeNear({ lat, lng }: { lat: number; lng: number }) {
  return <WeatherAlertBadge alerts={useWeatherAlertsNear(lat, lng)} />;
}

/** Full breakdown for the Details modal's weather section. */
export function WeatherAlertChips({ alerts }: { alerts: WeatherAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {alerts.map((alert) => (
        <span
          key={alert.kind}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${SEVERITY_STYLES[alert.severity]}`}
        >
          <TriangleAlert aria-hidden="true" className="h-3 w-3" />
          {WEATHER_ALERT_LABELS[alert.kind]} — {alert.summary}
        </span>
      ))}
    </div>
  );
}
