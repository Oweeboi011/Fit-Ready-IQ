import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token if present
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('fitready_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Health ────────────────────────────────────────────────────────────────────
export const checkHealth = () => apiClient.get('/api/health');

// ── Auth ──────────────────────────────────────────────────────────────────────
export const getStravaAuthUrl  = () => apiClient.get('/api/auth/strava/url');
export const getGarminAuthUrl  = () => apiClient.get('/api/auth/garmin/url');
export const getCorosAuthUrl   = () => apiClient.get('/api/auth/coros/url');

export const stravaCallback  = (code)                          => apiClient.post('/api/auth/strava/callback',  { code });
export const garminCallback  = (oauth_token, oauth_verifier)   => apiClient.post('/api/auth/garmin/callback',  { oauth_token, oauth_verifier });
export const corosCallback   = (code)                          => apiClient.post('/api/auth/coros/callback',   { code });

// ── Fitness ───────────────────────────────────────────────────────────────────
export const getFitnessSummary = () => apiClient.get('/api/fitness/summary');

// ── Score ─────────────────────────────────────────────────────────────────────
export const getScore         = ()        => apiClient.get('/api/score');
export const calculateScore   = (metrics) => apiClient.post('/api/score/calculate', metrics);

// ── Routes / Trails ───────────────────────────────────────────────────────────
export const getRoutes     = (params = {}) => apiClient.get('/api/routes', { params });
export const getRouteById  = (id)          => apiClient.get(`/api/routes/${id}`);
export const matchRoutes   = (fitnessScore, tolerance = 20) =>
  apiClient.post('/api/routes/match', { fitnessScore, tolerance });

// ── Gear ──────────────────────────────────────────────────────────────────────
export const getGear          = (params = {}) => apiClient.get('/api/gear', { params });
export const getGearCatalogue = ()             => apiClient.get('/api/gear/catalogue');

export default apiClient;
