'use client';

import { useCallback, useEffect, useState } from 'react';

import { deleteCloudPlan, fetchCloudPlans, mergePlans, writeCloudPlan } from './planSync';
import { deletePlan, loadPlans, replacePlans, savePlan, type SavedPlan } from './savedPlans';

export type PlanSyncStatus = 'device' | 'syncing' | 'synced' | 'failed';

/**
 * The planner's saved plans: on the device always, and in the account too when
 * signed in. Every change lands on the device first, so a failed sync never
 * costs a plan — it says so, and the next open tries again.
 */
export function usePlanSync(uid: string | null, isOpen: boolean) {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [status, setStatus] = useState<PlanSyncStatus>('device');

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
        const { plans: merged, upload } = mergePlans(loadPlans(), await fetchCloudPlans(uid));
        await Promise.all(upload.map((plan) => writeCloudPlan(uid, plan)));
        if (cancelled) return;
        setPlans(replacePlans(merged));
        setStatus('synced');
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
