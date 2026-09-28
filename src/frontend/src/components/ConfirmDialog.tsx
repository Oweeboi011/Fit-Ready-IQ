'use client';

import Modal from '@/components/Modal';
import { buttonSecondary, buttonSize } from '@/lib/ui';

/**
 * A confirmation for an irreversible action, in the app's own dialog shell.
 *
 * The admin purges used `window.confirm`, which blocks the whole tab, cannot
 * be styled or focus-managed, and is suppressed outright by some browsers
 * after a few prompts — at which point it returns false and the button
 * silently does nothing.
 *
 * The confirm button is the destructive red treatment rather than
 * `buttonPrimary`: the one thing this dialog must not do is make "delete" look
 * like the recommended path.
 */
const buttonDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ' +
  'bg-red-600 text-white hover:bg-red-500 active:bg-red-700';

export function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="max-w-md">
      <div className="space-y-5 p-5">
        <p className="text-sm text-slate-300">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`${buttonSecondary} ${buttonSize.md}`}
          >
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className={`${buttonDanger} ${buttonSize.md}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
