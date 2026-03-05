import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getScore, getFitnessSummary } from '../api/client';

// ── Mock data fallbacks ───────────────────────────────────────────────────────
const MOCK_SCORE = {
  score: 74,
  metrics: {
    vo2Max: 48.5,
    hrv: 62,
    weeklyDistanceKm: 42.3,
    trainingLoad: 68,
    sleepQualityScore: 78,
    restingHeartRate: 52,
    recoveryScore: 71,
    weeklyElevation: 1240,
    activityCount30d: 14,
    activeDays30d: 18,
  },
  calculatedAt: new Date().toISOString(),
};

const MOCK_SUMMARY = {
  strava: {
    activities: [
      { id: 1, name: 'Morning Trail Run', type: 'Run', distance: 8420, elapsed_time: 3240, total_elevation_gain: 320, start_date: new Date(Date.now() - 86400000).toISOString() },
      { id: 2, name: 'Ridge Hike',         type: 'Hike', distance: 12100, elapsed_time: 7200, total_elevation_gain: 580, start_date: new Date(Date.now() - 172800000).toISOString() },
      { id: 3, name: 'Easy Recovery Run',  type: 'Run', distance: 5200, elapsed_time: 1980, total_elevation_gain: 85,  start_date: new Date(Date.now() - 259200000).toISOString() },
      { id: 4, name: 'Weekend Long Run',   type: 'Run', distance: 18600, elapsed_time: 6840, total_elevation_gain: 420, start_date: new Date(Date.now() - 432000000).toISOString() },
    ],
    summary: { totalActivities: 14, totalDistance: 210000 },
  },
  garmin: {
    metrics: { hrv: 62, restingHeartRate: 52, sleepScore: 78, stressScore: 28 },
  },
  coros: null,
  fetchedAt: new Date().toISOString(),
};

const MOCK_CONNECTED = { strava: true, garmin: true, coros: false };

// ── Context definition ────────────────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [score, setScore]             = useState(null);
  const [fitnessSummary, setSummary]  = useState(null);
  const [connected, setConnected]     = useState({ strava: false, garmin: false, coros: false });
  const [user, setUser]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [useMock, setUseMock]         = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [scoreRes, summaryRes] = await Promise.all([
        getScore(),
        getFitnessSummary(),
      ]);
      setScore(scoreRes.data);
      setSummary(summaryRes.data);

      // Infer connected services from summary data
      const srv = summaryRes.data;
      setConnected({
        strava: !!(srv.strava && srv.strava.activities),
        garmin: !!(srv.garmin && srv.garmin.metrics),
        coros:  !!(srv.coros  && srv.coros.metrics),
      });
      setUseMock(false);
    } catch {
      // Backend unreachable — fall back to mock data
      setScore(MOCK_SCORE);
      setSummary(MOCK_SUMMARY);
      setConnected(MOCK_CONNECTED);
      setUseMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('fitready_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ id: payload.id, name: payload.name, email: payload.email });
      } catch {
        localStorage.removeItem('fitready_token');
      }
    }
    loadData();
  }, [loadData]);

  const saveToken = (token, userData) => {
    localStorage.setItem('fitready_token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('fitready_token');
    setUser(null);
    setConnected({ strava: false, garmin: false, coros: false });
  };

  const markConnected = (service) => {
    setConnected((prev) => ({ ...prev, [service]: true }));
  };

  const refresh = () => loadData();

  return (
    <AppContext.Provider
      value={{
        score,
        setScore,
        fitnessSummary,
        connected,
        markConnected,
        user,
        saveToken,
        logout,
        loading,
        useMock,
        refresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export default AppContext;
