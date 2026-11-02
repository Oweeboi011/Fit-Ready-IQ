'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteCloudPlan,
  fetchCloudPlans,
  mergePlans,
  writeCloudPlan,
  writeCloudPlans,
} from './planSync';
import { deletePlan, loadPlans, replacePlans, savePlan, type SavedPlan } from './savedPlans';

/** A sync interrupted by an edit merges again, at most this many times in all. */
const MAX_SYNC_ATTEMPTS = 3;

export type PlanSyncStatus = 'device' | 'syncing' | 'synced' | 'failed';

/**
 * The planner's saved plans: on the device always, and in the account too when
 * signed in. Every change lands on the device first, so a failed sync never
 * costs a plan — it says so, and the next open tries again.
 */
export function usePlanSync(uid: string | null, isOpen: boolean) {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [status, setStatus] = useState<PlanSyncStatus>('device');
  /**
   * Counts saves and deletes. The merge reads the device, waits on the
   * account, then writes the device back; an edit made during that wait would
   * be overwritten by the older list. A sync that sees the count move merges
   * again instead.
   */
  const edits = useRef(0);

  // Read after mount, never during render — storage reads during render make
  // the server and client disagree on first paint. Signed in, merge with the
  // account each time the planner opens, so another device's plans appear.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser state is read after mount; reading it during render breaks hydration
    setPlans(loadPlans());
    if (!uid) {
      setStatus('device');
      return;
    }

    let cancelled = false;
    setStatus('syncing');
    (async () => {
      try {
        for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
          const seen = edits.current;
          const { plans: merged, upload } = mergePlans(loadPlans(), await fetchCloudPlans(uid));
          await writeCloudPlans(uid, upload);
          if (cancelled) return;
          if (edits.current === seen) {
            setPlans(replacePlans(merged));
            setStatus('synced');
            return;
          }
        }
        // Edited faster than the account answers; the device list stands and
        // the next open merges it.
        if (!cancelled) setStatus('failed');
      } catch (err) {
        console.error('Plan sync failed:', err);
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, isOpen]);

  const save = useCallback(
    async (plan: SavedPlan) => {
      edits.current++;
      setPlans(savePlan({ ...plan, synced: false }));
      if (!uid) return;
      try {
        await writeCloudPlan(uid, plan);
        setPlans(savePlan({ ...plan, synced: true }));
        setStatus('synced');
      } catch (err) {
        console.error('Plan sync failed:', err);
        setStatus('failed');
      }
    },
    [uid]
  );

  const remove = useCallback(
    async (id: string) => {
      edits.current++;
      setPlans(deletePlan(id));
      if (!uid) return;
      try {
        await deleteCloudPlan(uid, id);
      } catch (err) {
        // Still in the account, so the next sync brings it back — which is
        // honest: it was not deleted there. Say so now rather than then.
        console.error('Plan delete failed:', err);
        setStatus('failed');
      }
    },
    [uid]
  );

  return { plans, status, save, remove };
}
