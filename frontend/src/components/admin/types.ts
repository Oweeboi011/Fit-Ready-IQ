export interface CacheEntry {
  gridKey: string;
  ageHours: number;
  fresh: boolean;
  routeCount: number;
  mountainCount: number;
  campsiteCount: number;
  location?: { lat: number; lng: number; address?: string };
}

export interface CacheStats {
  total: number;
  fresh: number;
  stale: number;
  entries: CacheEntry[];
}

export interface StravaSyncEntry {
  uid: string;
  last_synced_at: string | null;
  total_activities: number;
  errors: string[] | null;
}

export interface ServiceStatus {
  ok: boolean;
  message: string;
}

export interface AdminData {
  cache: CacheStats | null;
  stravaSync: { total: number; entries: StravaSyncEntry[] } | null;
  health: Record<string, ServiceStatus> | null;
  status: 'loading' | 'ready';
  error: string | null;
}
