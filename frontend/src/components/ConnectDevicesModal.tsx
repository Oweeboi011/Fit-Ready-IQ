"use client";

import { useState, useEffect } from "react";
import {
  type Activity,
  saveActivities,
  loadActivities,
  mergeActivities,
} from "@/lib/activityTypes";
import { parseGpxFile } from "@/lib/gpxParser";

interface ConnectDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivitiesLoaded: (activities: Activity[]) => void;
}

interface Device {
  id: "strava" | "coros" | "garmin" | "komoot";
  name: string;
  description: string;
  icon: string;
  type: "oauth" | "file-upload";
  status: "connected" | "disconnected";
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
      id: "strava",
      name: "Strava",
      description: "Sync runs, rides, and hikes from Strava",
      icon: "RUN",
      type: "oauth",
      status: "disconnected",
      color: "bg-orange-500",
    },
    {
      id: "coros",
      name: "COROS",
      description: "Upload GPX files from your COROS watch",
      icon: "⌚",
      type: "file-upload",
      status: "disconnected",
      color: "bg-blue-600",
    },
    {
      id: "garmin",
      name: "Garmin Connect",
      description: "Upload activities exported from Garmin devices",
      icon: "DEVICE",
      type: "file-upload",
      status: "disconnected",
      color: "bg-sky-500",
    },
    {
      id: "komoot",
      name: "Komoot",
      description: "Import routes and tours exported from Komoot",
      icon: "MAP️",
      type: "file-upload",
      status: "disconnected",
      color: "bg-green-600",
    },
  ]);

  const [uploadingDevice, setUploadingDevice] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ [key: string]: File[] }>({});
  const [parseError, setParseError] = useState<{ [key: string]: string }>({});

  // On open — reflect persisted connection state from localStorage
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem("fri_strava_token");
      if (raw) {
        const token = JSON.parse(raw);
        const expired = token.expires_at
          ? Date.now() / 1000 > token.expires_at
          : false;
        if (!expired) {
          const stravaCount = loadActivities().filter(
            (a) => a.source === "strava"
          ).length;
          setDevices((prev) =>
            prev.map((d) =>
              d.id === "strava"
                ? { ...d, status: "connected", activityCount: stravaCount }
                : d
            )
          );
        }
      }
      const existing = loadActivities();
      const sourceCounts: Partial<Record<Device["id"], number>> = {};
      for (const a of existing) {
        if (a.source !== "strava") {
          sourceCounts[a.source] = (sourceCounts[a.source] ?? 0) + 1;
        }
      }
      if (Object.keys(sourceCounts).length > 0) {
        setDevices((prev) =>
          prev.map((d) => {
            const count = sourceCounts[d.id];
            return count !== undefined
              ? { ...d, status: "connected", activityCount: count }
              : d;
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
        "Strava Client ID is not configured.\n\nAdd NEXT_PUBLIC_STRAVA_CLIENT_ID to your .env.local and rebuild."
      );
      return;
    }
    const redirectUri = `${window.location.origin}/auth/callback/strava`;
    const scope = "read,activity:read_all,profile:read_all";
    window.location.href = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  };

  const handleFileSelect = (deviceId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles((prev) => ({ ...prev, [deviceId]: files }));
    setParseError((prev) => ({ ...prev, [deviceId]: "" }));
  };

  const handleFileUpload = async (deviceId: "coros" | "garmin" | "komoot") => {
    const files = selectedFiles[deviceId];
    if (!files || files.length === 0) return;

    setUploadingDevice(deviceId);
    setParseError((prev) => ({ ...prev, [deviceId]: "" }));

    const newActivities: Activity[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
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
      } catch (err) {
        errors.push(
          `${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    if (errors.length > 0) {
      setParseError((prev) => ({ ...prev, [deviceId]: errors.join("\n") }));
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
                status: "connected",
                activityCount: (d.activityCount ?? 0) + newActivities.length,
              }
            : d
        )
      );
      setSelectedFiles((prev) => ({ ...prev, [deviceId]: [] }));
    }

    setUploadingDevice(null);
  };

  const handleDisconnect = (deviceId: Device["id"]) => {
    if (deviceId === "strava") {
      try {
        localStorage.removeItem("fri_strava_token");
      } catch {
        // ignore
      }
    }
    const filtered = loadActivities().filter((a) => a.source !== deviceId);
    saveActivities(filtered);
    onActivitiesLoaded(filtered);
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? { ...d, status: "disconnected", activityCount: undefined }
          : d
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Connect Devices</h2>
            <p className="mt-1 text-sm text-slate-600">
              Import your activity history and routes
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Device List */}
        <div className="p-6 space-y-4">
          {devices.map((device) => (
            <div
              key={device.id}
              className="rounded-lg border border-slate-200 p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ${device.color} text-2xl`}
                  >
                    {device.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">{device.name}</h3>
                    <p className="mt-0.5 text-sm text-slate-600">{device.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {device.status === "connected" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Connected
                          {device.activityCount !== undefined && (
                            <span className="ml-1 rounded-full bg-green-200 px-1.5 text-[10px] font-bold text-green-800">
                              {device.activityCount} activities
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          Not connected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {device.status === "disconnected" ? (
                    device.type === "oauth" ? (
                      <button
                        onClick={handleStravaConnect}
                        className={`rounded-lg ${device.color} px-4 py-2 text-sm font-medium text-white hover:opacity-90`}
                      >
                        Connect
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor={`file-${device.id}`}
                          className={`cursor-pointer rounded-lg ${device.color} px-4 py-2 text-center text-sm font-medium text-white hover:opacity-90`}
                        >
                          Choose Files
                        </label>
                        <input
                          id={`file-${device.id}`}
                          type="file"
                          multiple
                          accept=".gpx,.tcx"
                          onChange={(e) => handleFileSelect(device.id, e)}
                          className="hidden"
                        />
                        {selectedFiles[device.id]?.length > 0 && (
                          <button
                            onClick={() =>
                              handleFileUpload(device.id as "coros" | "garmin" | "komoot")
                            }
                            disabled={uploadingDevice === device.id}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {uploadingDevice === device.id
                              ? "Parsing..."
                              : `Import (${selectedFiles[device.id].length})`}
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col gap-2">
                      {device.type === "file-upload" && (
                        <>
                          <label
                            htmlFor={`file-more-${device.id}`}
                            className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Add more files
                          </label>
                          <input
                            id={`file-more-${device.id}`}
                            type="file"
                            multiple
                            accept=".gpx,.tcx"
                            onChange={(e) => handleFileSelect(device.id, e)}
                            className="hidden"
                          />
                          {selectedFiles[device.id]?.length > 0 && (
                            <button
                              onClick={() =>
                                handleFileUpload(
                                  device.id as "coros" | "garmin" | "komoot"
                                )
                              }
                              disabled={uploadingDevice === device.id}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {uploadingDevice === device.id
                                ? "Parsing..."
                                : `Import (${selectedFiles[device.id].length})`}
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => handleDisconnect(device.id)}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Export instructions */}
              {device.type === "file-upload" && (
                <div className="mt-3 rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Supported formats:</strong> .gpx, .tcx
                    <br />
                    <strong>How to export: </strong>
                    {device.id === "coros" &&
                      "COROS app → Activities → select activity → Share → Export GPX"}
                    {device.id === "garmin" &&
                      "Garmin Connect → Activity → ··· → Export Original"}
                    {device.id === "komoot" &&
                      "Komoot → Tour → Share → Export as GPX"}
                  </p>
                </div>
              )}

              {/* Parse errors */}
              {parseError[device.id] && (
                <div className="mt-3 rounded-lg bg-red-50 p-3">
                  <p className="whitespace-pre-line text-xs text-red-700">
                    {parseError[device.id]}
                  </p>
                </div>
              )}

              {/* Selected files preview */}
              {selectedFiles[device.id]?.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-700">
                    Ready to import:
                  </p>
                  <ul className="space-y-1">
                    {selectedFiles[device.id].map((file, index) => (
                      <li key={index} className="flex items-center gap-2 text-xs text-slate-600">
                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {file.name} ({(file.size / 1024).toFixed(1)} KB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <svg className="h-5 w-5 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>
              Activity data is stored locally in your browser. GPX files are
              parsed on-device — no files are uploaded to any server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

