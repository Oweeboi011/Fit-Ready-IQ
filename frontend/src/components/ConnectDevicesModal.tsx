"use client";

import { useState } from "react";

interface ConnectDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Device {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "oauth" | "file-upload";
  status: "connected" | "disconnected";
  color: string;
}

export default function ConnectDevicesModal({
  isOpen,
  onClose,
}: ConnectDevicesModalProps) {
  const [devices, setDevices] = useState<Device[]>([
    {
      id: "strava",
      name: "Strava",
      description: "Sync activities from Strava",
      icon: "🏃",
      type: "oauth",
      status: "disconnected",
      color: "bg-orange-500",
    },
    {
      id: "coros",
      name: "COROS",
      description: "Upload FIT files from your COROS watch",
      icon: "⌚",
      type: "file-upload",
      status: "disconnected",
      color: "bg-blue-600",
    },
    {
      id: "garmin",
      name: "Garmin Connect",
      description: "Upload activities from Garmin devices",
      icon: "📱",
      type: "file-upload",
      status: "disconnected",
      color: "bg-sky-500",
    },
    {
      id: "komoot",
      name: "Komoot",
      description: "Import routes and tours from Komoot",
      icon: "🗺️",
      type: "file-upload",
      status: "disconnected",
      color: "bg-green-600",
    },
  ]);

  const [uploadingDevice, setUploadingDevice] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ [key: string]: File[] }>({});

  if (!isOpen) return null;

  const handleOAuthConnect = async (deviceId: string) => {
    // TODO: Implement OAuth flow
    if (deviceId === "strava") {
      // Redirect to Strava OAuth
      const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
      const redirectUri = `${window.location.origin}/auth/callback/strava`;
      const scope = "read,activity:read_all,profile:read_all";
      
      if (clientId) {
        window.location.href = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`;
      } else {
        alert("Strava Client ID not configured");
      }
    }
  };

  const handleFileSelect = (deviceId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles((prev) => ({
      ...prev,
      [deviceId]: files,
    }));
  };

  const handleFileUpload = async (deviceId: string) => {
    const files = selectedFiles[deviceId];
    if (!files || files.length === 0) return;

    setUploadingDevice(deviceId);

    try {
      // TODO: Implement file upload API call
      const formData = new FormData();
      files.forEach((file, index) => {
        formData.append(`file${index}`, file);
      });

      const response = await fetch(`/api/devices/${deviceId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        // Update device status
        setDevices((prev) =>
          prev.map((device) =>
            device.id === deviceId
              ? { ...device, status: "connected" as const }
              : device
          )
        );
        
        // Clear selected files
        setSelectedFiles((prev) => ({
          ...prev,
          [deviceId]: [],
        }));
        
        alert(`Successfully uploaded ${files.length} file(s) from ${devices.find(d => d.id === deviceId)?.name}`);
      } else {
        alert("Upload failed. Please try again.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setUploadingDevice(null);
    }
  };

  const handleDisconnect = (deviceId: string) => {
    // TODO: Implement disconnect API call
    setDevices((prev) =>
      prev.map((device) =>
        device.id === deviceId
          ? { ...device, status: "disconnected" as const }
          : device
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Connect Devices</h2>
            <p className="mt-1 text-sm text-gray-600">
              Sync your fitness data from multiple sources
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Device List */}
        <div className="p-6 space-y-4">
          {devices.map((device) => (
            <div
              key={device.id}
              className="rounded-lg border border-gray-200 p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-lg ${device.color} text-2xl`}
                  >
                    {device.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{device.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">{device.description}</p>
                    
                    {/* Status Badge */}
                    <div className="mt-2">
                      {device.status === "connected" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          <svg
                            className="h-3 w-3"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                          Not Connected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2">
                  {device.status === "disconnected" ? (
                    device.type === "oauth" ? (
                      <button
                        onClick={() => handleOAuthConnect(device.id)}
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
                          accept=".fit,.gpx,.tcx"
                          onChange={(e) => handleFileSelect(device.id, e)}
                          className="hidden"
                        />
                        
                        {selectedFiles[device.id] && selectedFiles[device.id].length > 0 && (
                          <button
                            onClick={() => handleFileUpload(device.id)}
                            disabled={uploadingDevice === device.id}
                            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                          >
                            {uploadingDevice === device.id
                              ? "Uploading..."
                              : `Upload (${selectedFiles[device.id].length})`}
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <button
                      onClick={() => handleDisconnect(device.id)}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* File Upload Info */}
              {device.type === "file-upload" && (
                <div className="mt-3 rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Supported formats:</strong> .fit, .gpx, .tcx files
                    <br />
                    <strong>How to export:</strong>{" "}
                    {device.id === "coros" && "Open COROS app → Activities → Select activity → Export → FIT file"}
                    {device.id === "garmin" && "Garmin Connect → Activity → Settings → Export Original"}
                    {device.id === "komoot" && "Komoot app → Tour → Share → Export as GPX"}
                  </p>
                </div>
              )}

              {/* Selected Files Preview */}
              {selectedFiles[device.id] && selectedFiles[device.id].length > 0 && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-medium text-gray-700">
                    Selected files:
                  </p>
                  <ul className="space-y-1">
                    {selectedFiles[device.id].map((file, index) => (
                      <li key={index} className="flex items-center gap-2 text-xs text-gray-600">
                        <svg
                          className="h-4 w-4 text-gray-400"
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
        <div className="border-t border-gray-200 bg-gray-50 p-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg
              className="h-5 w-5 text-blue-500"
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
              Your data is stored securely and never shared without your permission.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
