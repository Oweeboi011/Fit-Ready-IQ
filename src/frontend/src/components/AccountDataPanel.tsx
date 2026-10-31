'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, Trash2 } from 'lucide-react';

import { authedFetch } from '@/lib/firebaseClient';
import { buttonGhost, buttonSecondary, buttonSize } from '@/lib/ui';

/**
 * The data rights the API already implemented, finally reachable.
 *
 * `/api/account/export` (GDPR Art. 15) and `/api/account/delete` (Art. 17)
 * existed with no way in from the product, so a user could only exercise
 * either by asking someone to run it for them — which is not a right anyone
 * can actually use.
 *
 * Deletion confirms inline rather than in a second dialog (this sits inside
 * the profile modal), and asks for the same word the route requires.
 */
export function AccountDataPanel({ onDeleted }: { onDeleted: () => void }) {
  const [exportState, setExportState] = useState<'idle' | 'working' | 'error'>('idle');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleteState, setDeleteState] = useState<'idle' | 'working'>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function downloadExport() {
    setExportState('working');
    try {
      const res = await authedFetch('/api/account/export');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `fit-ready-iq-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExportState('idle');
    } catch {
      setExportState('error');
    }
  }

  async function deleteAccount() {
    setDeleteState('working');
    setDeleteError(null);
    try {
      const res = await authedFetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (res.ok) {
        onDeleted();
        return;
      }
      setDeleteError(
        res.status === 429
          ? 'Too many attempts. Wait an hour and try again.'
          : 'Deletion did not complete. Some data may already be gone; your account was kept so you can try again.'
      );
    } catch {
      setDeleteError("We couldn't reach the server. Nothing was deleted; try again.");
    }
    setDeleteState('idle');
  }

  return (
    <section className="rounded-xl border border-ink/[0.06] bg-slate-800/60 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Your data</h3>
        <Link href="/privacy" className="text-[11px] text-slate-400 hover:text-slate-200">
          What we keep, and why
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void downloadExport()}
          disabled={exportState === 'working'}
          className={`${buttonSecondary} ${buttonSize.sm}`}
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          {exportState === 'working' ? 'Preparing…' : 'Download my data'}
        </button>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${buttonGhost} ${buttonSize.sm} text-red-400 hover:bg-red-500/15 hover:text-red-300`}
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            Delete account
          </button>
        )}
      </div>

      {exportState === 'error' && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          The export didn&apos;t download. Try again in a moment.
        </p>
      )}

      {confirming && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-xs text-red-200">
            This permanently deletes your account, saved places, synced activities and chat history,
            and withdraws our access to Strava. It cannot be undone.
          </p>
          <label className="mt-2 block text-[11px] text-slate-300">
            Type <span className="font-mono font-semibold text-white">DELETE</span> to confirm
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-ink/15 bg-slate-950/60 px-2 py-1.5 text-xs text-white outline-none focus:border-red-400/60"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={typed !== 'DELETE' || deleteState === 'working'}
              className={`${buttonGhost} ${buttonSize.sm} text-red-300 hover:bg-red-500/20 hover:text-red-200`}
            >
              {deleteState === 'working' ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped('');
                setDeleteError(null);
              }}
              disabled={deleteState === 'working'}
              className={`${buttonGhost} ${buttonSize.sm}`}
            >
              Cancel
            </button>
          </div>
          {deleteError && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {deleteError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
