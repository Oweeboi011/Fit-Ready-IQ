"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function StravaCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Connecting to Strava...");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("Connection cancelled.");
      setTimeout(() => router.replace("/"), 2500);
      return;
    }

    if (!code) {
      setStatus("Invalid callback. Redirecting...");
      setTimeout(() => router.replace("/"), 2500);
      return;
    }

    fetch("/api/strava/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.access_token) {
          try {
            localStorage.setItem(
              "fri_strava_token",
              JSON.stringify({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: data.expires_at,
                athlete: data.athlete,
              })
            );
          } catch {
            // localStorage unavailable — proceed anyway
          }
          setStatus("Connected! Loading your activities...");
          router.replace("/");
        } else {
          setStatus("Connection failed. Redirecting...");
          setTimeout(() => router.replace("/"), 2500);
        }
      })
      .catch(() => {
        setStatus("Connection failed. Redirecting...");
        setTimeout(() => router.replace("/"), 2500);
      });
  }, [searchParams, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="mb-5 h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent mx-auto" />
        <p className="text-lg font-semibold text-white">{status}</p>
        <p className="mt-2 text-sm text-slate-400">
          You will be redirected automatically
        </p>
      </div>
    </div>
  );
}

export default function StravaCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-950">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
        </div>
      }
    >
      <StravaCallbackInner />
    </Suspense>
  );
}
