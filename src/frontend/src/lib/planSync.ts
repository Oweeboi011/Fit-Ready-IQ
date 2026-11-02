'use client';

import { getFirestoreDb } from './useSavedPlaces';
import type { SavedPlan } from './savedPlans';

/**
 * Planned routes, synced to the account (#23).
 *
 * The device stays the first home of a plan — the planner works signed out,
 * and a plan built before signing in is the last thing to lose at sign-in — so
 * this mirrors the device list to `users/{uid}/plans` rather than replacing it.
 *
 * Deletion is the hard part of two-way sync: a plan deleted on the phone is
 * still on the laptop, and a naive merge uploads it straight back. Each local
 * plan therefore records whether it has been synced. A synced plan missing from
 * the account was deleted elsewhere and is dropped here; an unsynced one was
 * made on this device signed out and is uploaded.
 */

/** The cloud document: the plan without its id (the doc id) or the local sync flag. */
type PlanDocument = Omit<SavedPlan, 'id' | 'synced'>;

export interface MergeResult {
  /** What this device should now hold, newest first, every entry synced. */
  plans: SavedPlan[];
  /** Plans the account does not have yet, or has an older copy of. */
  upload: SavedPlan[];
}

/** Two-way merge by id; the later `savedAt` wins a conflict. Pure. */
export function mergePlans(local: SavedPlan[], cloud: SavedPlan[]): MergeResult {
  const byId = new Map(cloud.map((p) => [p.id, { ...p, synced: true }]));
  const upload: SavedPlan[] = [];

  for (const plan of local) {
    const remote = byId.get(plan.id);
    if (remote) {
      if (plan.savedAt > remote.savedAt) {
        byId.set(plan.id, { ...plan, synced: true });
        upload.push(plan);
      }
    } else if (!plan.synced) {
      byId.set(plan.id, { ...plan, synced: true });
      upload.push(plan);
    }
    // Synced here, absent there: deleted on another device. Let it go.
  }

  const plans = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
  return { plans, upload };
}

function toDocument(plan: SavedPlan): PlanDocument {
  return {
    name: plan.name,
    // Only the fields the rules allow; `elevation` is dropped when unknown
    // rather than written as undefined, which Firestore rejects.
    waypoints: plan.waypoints.map(({ id, name, coordinates, elevation }) => ({
      id,
      name,
      coordinates,
      ...(elevation == null ? {} : { elevation }),
    })),
    savedAt: plan.savedAt,
    distanceKm: plan.distanceKm,
  };
}

async function plansCollection(uid: string) {
  const db = await getFirestoreDb();
  if (!db) throw new Error('Firestore is not configured');
  const firestore = await import('firebase/firestore');
  return { firestore, ref: firestore.collection(db, 'users', uid, 'plans') };
}

export async function fetchCloudPlans(uid: string): Promise<SavedPlan[]> {
  const { firestore, ref } = await plansCollection(uid);
  const snapshot = await firestore.getDocs(ref);
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as PlanDocument), synced: true }));
}

export async function writeCloudPlan(uid: string, plan: SavedPlan): Promise<void> {
  const { firestore, ref } = await plansCollection(uid);
  await firestore.setDoc(firestore.doc(ref, plan.id), {
    ...toDocument(plan),
    updatedAt: firestore.serverTimestamp(),
  });
}

export async function deleteCloudPlan(uid: string, id: string): Promise<void> {
  const { firestore, ref } = await plansCollection(uid);
  await firestore.deleteDoc(firestore.doc(ref, id));
}
