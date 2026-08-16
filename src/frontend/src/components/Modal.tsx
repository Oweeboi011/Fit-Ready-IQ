'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';

/** Elements that can hold focus. Used to find the trap's first and last stops. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Rendered into the sticky header and used as the dialog's accessible name. */
  title: ReactNode;
  /** Plain-text name when `title` is markup a screen reader shouldn't read whole. */
  label?: string;
  /** Optional header content between the title and the close button. */
  headerExtra?: ReactNode;
  /** Tailwind max-width for the panel, e.g. 'max-w-3xl'. */
  maxWidth?: string;
  children: ReactNode;
}

/**
 * The dialog shell.
 *
 * The same markup was written out three times — DetailsModal, ConnectDevices
 * and Profile — and none of the three was a dialog in any sense that mattered:
 * no `role`, no Escape, no backdrop dismissal, no focus trap, and Tab walked
 * straight out into the page behind. This is that shell, once, done properly.
 *
 * The mobile bottom-sheet treatment comes from ProfileModal, which was the only
 * one that had it.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  label,
  headerExtra,
  maxWidth = 'max-w-3xl',
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Remember who opened us, so focus can go home on close.
  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  // The page behind must not scroll under the overlay.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // Move focus into the dialog so the first Tab lands inside it, not in the
  // page behind.
  useEffect(() => {
    if (!isOpen) return;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Wrap at both ends rather than letting focus escape the dialog.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        // Only a press that both starts and ends on the backdrop dismisses —
        // otherwise a text selection dragged out of the panel closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={label ? undefined : titleId}
        aria-label={label}
        onKeyDown={handleKeyDown}
        className={`modal-enter relative max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-t-2xl border border-ink/[0.08] bg-slate-900 shadow-2xl sm:rounded-2xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-ink/[0.06] bg-slate-900/95 px-6 py-4 backdrop-blur-xl">
          <div id={titleId} className="flex min-w-0 flex-1 items-start gap-3">
            {title}
          </div>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-ink/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
