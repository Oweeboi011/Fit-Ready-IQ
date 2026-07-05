'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  type Activity,
  saveActivities,
  loadActivities,
  mergeActivities,
} from '@/lib/activityTypes';
import { parseGpxFile } from '@/lib/gpxParser';
import { parseAppleHealthXml, appleHealthWorkoutsToActivities } from '@/lib/appleHealthParser';

interface ConnectDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivitiesLoaded: (activities: Activity[]) => void;
}

interface Device {
  id: 'strava' | 'coros' | 'garmin' | 'komoot' | 'apple_health';
  name: string;
  description: string;
  type: 'oauth' | 'file-upload';
  status: 'connected' | 'disconnected';
  color: string;
  activityCount?: number;
}

export default function ConnectDevicesModal({
  isOpen,
  onClose,
  onActivitiesLoaded,
}: ConnectDevicesModalProps) {
  const [devices, setDevices] = useState<Device[]>([
    {
      id: 'strava',
      name: 'Strava',
      description: 'Sync runs, rides, and hikes from Strava',
      type: 'oauth',
      status: 'disconnected',
      color: 'bg-orange-500',
    },
    {
      id: 'coros',
      name: 'COROS',
      description: 'Upload GPX files from your COROS watch',
      type: 'file-upload',
      status: 'disconnected',
      color: 'bg-blue-600',
    },
    {
      id: 'garmin',
      name: 'Garmin Connect',
      description: 'Upload activities exported from Garmin devices',
      type: 'file-upload',
      status: 'disconnected',
      color: 'bg-sky-500',
    },
    {
      id: 'komoot',
      name: 'Komoot',
      description: 'Import routes and tours exported from Komoot',
      type: 'file-upload',
      status: 'disconnected',
      color: 'bg-green-600',
    },
    {
      id: 'apple_health',
      name: 'Apple Health',
      description: 'Import workouts from your Apple Health export',
      type: 'file-upload',
      status: 'disconnected',
      color: 'bg-red-500',
    },
  ]);

  const [uploadingDevice, setUploadingDevice] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ [key: string]: File[] }>({});
  const [parseError, setParseError] = useState<{ [key: string]: string }>({});

  // On open — reflect persisted connection state from localStorage
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem('fri_strava_token');
      if (raw) {
        const token = JSON.parse(raw);
        const expired = token.expires_at ? Date.now() / 1000 > token.expires_at : false;
        if (!expired) {
          const stravaCount = loadActivities().filter((a) => a.source === 'strava').length;
          setDevices((prev) =>
            prev.map((d) =>
              d.id === 'strava' ? { ...d, status: 'connected', activityCount: stravaCount } : d
            )
          );
        }
      }
      const existing = loadActivities();
      const sourceCounts: Partial<Record<Device['id'], number>> = {};
      for (const a of existing) {
        if (a.source !== 'strava') {
          sourceCounts[a.source] = (sourceCounts[a.source] ?? 0) + 1;
        }
      }
      if (Object.keys(sourceCounts).length > 0) {
        setDevices((prev) =>
          prev.map((d) => {
            const count = sourceCounts[d.id];
            return count !== undefined ? { ...d, status: 'connected', activityCount: count } : d;
          })
        );
      }
    } catch {
      // localStorage may be unavailable
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStravaConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
    if (!clientId) {
      alert(
        'Strava Client ID is not configured.\n\nAdd NEXT_PUBLIC_STRAVA_CLIENT_ID to your .env.local and rebuild.'
      );
      return;
    }
    const redirectUri = `${window.location.origin}/auth/callback/strava`;
    const scope = 'read,activity:read_all,profile:read_all';
    window.location.href = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  };

  const handleFileSelect = (deviceId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles((prev) => ({ ...prev, [deviceId]: files }));
    setParseError((prev) => ({ ...prev, [deviceId]: '' }));
  };

  const handleFileUpload = async (deviceId: 'coros' | 'garmin' | 'komoot' | 'apple_health') => {
    const files = selectedFiles[deviceId];
    if (!files || files.length === 0) return;

    setUploadingDevice(deviceId);
    setParseError((prev) => ({ ...prev, [deviceId]: '' }));

    const newActivities: Activity[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        if (deviceId === 'apple_health') {
          const text = await file.text();
          const workouts = parseAppleHealthXml(text);
          const acts = appleHealthWorkoutsToActivities(workouts, file.name);
          newActivities.push(...acts);
        } else {
          const parsed = await parseGpxFile(file);
          newActivities.push({
            id: `${deviceId}_${file.name}_${parsed.start_date}`,
            source: deviceId,
            name: parsed.name,
            sport_type: parsed.sport_type,
            start_date: parsed.start_date,
            distance_km: parsed.distance_km,
            elevation_gain_m: parsed.elevation_gain_m,
            moving_time_s: parsed.moving_time_s,
            polyline: parsed.polyline,
            start_latlng: parsed.start_latlng,
            external_id: file.name,
          });
        }
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (errors.length > 0) {
      setParseError((prev) => ({ ...prev, [deviceId]: errors.join('\n') }));
    }

    if (newActivities.length > 0) {
      const merged = mergeActivities(loadActivities(), newActivities);
      saveActivities(merged);
      onActivitiesLoaded(merged);
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? {
                ...d,
                status: 'connected',
                activityCount: (d.activityCount ?? 0) + newActivities.length,
              }
            : d
        )
      );
      setSelectedFiles((prev) => ({ ...prev, [deviceId]: [] }));
    }

    setUploadingDevice(null);
  };

  const handleDisconnect = (deviceId: Device['id']) => {
    if (deviceId === 'strava') {
      try {
        localStorage.removeItem('fri_strava_token');
      } catch {
        // ignore
      }
    }
    const filtered = loadActivities().filter(
      (a) => a.source !== (deviceId === 'apple_health' ? 'apple_health' : deviceId)
    );
    saveActivities(filtered);
    onActivitiesLoaded(filtered);
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId ? { ...d, status: 'disconnected', activityCount: undefined } : d
      )
    );
  };

  // Brand SVG icons for each platform
  const DeviceIcon = ({ id }: { id: Device['id'] }) => {
    if (id === 'strava')
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-white">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
      );
    if (id === 'coros')
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-6 w-6 text-white"
        >
          <rect x="5" y="2" width="14" height="20" rx="4" />
          <circle cx="12" cy="12" r="3.5" />
          <line x1="12" y1="8.5" x2="12" y2="12" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="12" x2="14.2" y2="13.3" strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="5" x2="16" y2="5" strokeWidth="1.5" />
          <line x1="8" y1="19" x2="16" y2="19" strokeWidth="1.5" />
        </svg>
      );
    if (id === 'garmin')
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-white">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l7 4.5-7 4.5z" />
        </svg>
      );
    if (id === 'komoot')
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-white">
          <path d="M12 2L2 19h4l6-11 6 11h4L12 2z" />
          <circle cx="12" cy="5" r="1.5" fill="white" />
        </svg>
      );
    if (id === 'apple_health')
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-white">
          <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.518 4.068 2 6.281 2c1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447C20.266 2.01 23 3.631 23 7.191c0 4.069-5.136 8.625-11 14.402z" />
        </svg>
      );
    return null;
  };

  const deviceColorMap: Record<Device['id'], string> = {
    strava: 'bg-[#fc4c02]',
    coros: 'bg-blue-600',
    garmin: 'bg-sky-500',
    komoot: 'bg-green-600',
    apple_health: 'bg-red-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-white/[0.06] bg-slate-900/95 px-6 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold text-white">Connect Devices</h2>
            <p className="mt-0.5 text-xs text-slate-400">Import your activity history and routes</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Device List */}
        <div className="space-y-3 p-5">
          {devices.map((device) => (
            <div
              key={device.id}
              className="rounded-xl border border-white/[0.06] bg-slate-800/50 p-4 transition-all hover:border-white/10 hover:bg-slate-800/80"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3.5">
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${deviceColorMap[device.id]} shadow-lg`}
                  >
                    <DeviceIcon id={device.id} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{device.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-400">{device.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {device.status === 'connected' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-400 ring-1 ring-green-500/30">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                          Connected
                          {device.activityCount !== undefined && (
                            <span className="ml-0.5 rounded-full bg-green-500/20 px-1.5 text-[10px] font-bold text-green-300">
                              {device.activityCount}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-white/10">
                          Not connected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-shrink-0 flex-col gap-2">
                  {device.status === 'disconnected' ? (
                    device.type === 'oauth' ? (
                      <button
                        onClick={handleStravaConnect}
                        className={`rounded-lg ${deviceColorMap[device.id]} px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90`}
                      >
                        Connect
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor={`file-${device.id}`}
                          className={`cursor-pointer rounded-lg ${deviceColorMap[device.id]} px-4 py-1.5 text-center text-xs font-semibold text-white transition-opacity hover:opacity-90`}
                        >
                          Choose Files
                        </label>
                        <input
                          id={`file-${device.id}`}
                          type="file"
                          multiple={device.id !== 'apple_health'}
                          accept={device.id === 'apple_health' ? '.xml' : '.gpx,.tcx'}
                          onChange={(e) => handleFileSelect(device.id, e)}
                          className="hidden"
                        />
                        {selectedFiles[device.id]?.length > 0 && (
                          <button
                            onClick={() =>
                              handleFileUpload(
                                device.id as 'coros' | 'garmin' | 'komoot' | 'apple_health'
                              )
                            }
                            disabled={uploadingDevice === device.id}
                            className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                          >
                            {uploadingDevice === device.id
                              ? 'Parsing...'
                              : `Import (${selectedFiles[device.id].length})`}
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col gap-2">
                      {device.type === 'file-upload' && (
                        <>
                          <label
                            htmlFor={`file-more-${device.id}`}
                            className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-center text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            Add more files
                          </label>
                          <input
                            id={`file-more-${device.id}`}
                            type="file"
                            multiple={device.id !== 'apple_health'}
                            accept={device.id === 'apple_health' ? '.xml' : '.gpx,.tcx'}
                            onChange={(e) => handleFileSelect(device.id, e)}
                            className="hidden"
                          />
                          {selectedFiles[device.id]?.length > 0 && (
                            <button
                              onClick={() =>
                                handleFileUpload(
                                  device.id as 'coros' | 'garmin' | 'komoot' | 'apple_health'
                                )
                              }
                              disabled={uploadingDevice === device.id}
                              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                            >
                              {uploadingDevice === device.id
                                ? 'Parsing...'
                                : `Import (${selectedFiles[device.id].length})`}
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => handleDisconnect(device.id)}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
                      >
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Export instructions */}
              {device.type === 'file-upload' && (
                <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                  <p className="text-xs text-blue-300">
                    {device.id === 'apple_health' ? (
                      <>
                        <span className="font-semibold text-blue-200">Supported format:</span>{' '}
                        export.xml
                        <br />
                        <span className="font-semibold text-blue-200">How to export: </span>
                        iPhone → Health app → your profile → Export All Health Data → share the .zip
                        → extract export.xml
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-blue-200">Supported formats:</span>{' '}
                        .gpx, .tcx
                        <br />
                        <span className="font-semibold text-blue-200">How to export: </span>
                        {device.id === 'coros' &&
                          'COROS app → Activities → select activity → Share → Export GPX'}
                        {device.id === 'garmin' &&
                          'Garmin Connect → Activity → ··· → Export Original'}
                        {device.id === 'komoot' && 'Komoot → Tour → Share → Export as GPX'}
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Parse errors */}
              {parseError[device.id] && (
                <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                  <p className="whitespace-pre-line text-xs text-red-300">
                    {parseError[device.id]}
                  </p>
                </div>
              )}

              {/* Selected files preview */}
              {selectedFiles[device.id]?.length > 0 && (
                <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/5 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-300">Ready to import:</p>
                  <ul className="space-y-1">
                    {selectedFiles[device.id].map((file, index) => (
                      <li key={index} className="flex items-center gap-2 text-xs text-slate-400">
                        <svg
                          className="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span className="truncate">{file.name}</span>
                        <span className="flex-shrink-0 text-slate-400">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="rounded-b-2xl border-t border-white/[0.06] bg-slate-900/80 px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <svg
              className="h-4 w-4 flex-shrink-0 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p>
              Activity data is stored locally in your browser. GPX files are parsed on-device — no
              files are uploaded to any server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
