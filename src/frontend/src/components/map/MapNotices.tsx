import { X } from 'lucide-react';
import { buttonGhost, buttonSize } from '@/lib/ui';

interface MapNoticesProps {
  showFirstRunHint: boolean;
  isLoading: boolean;
  onDismissFirstRunHint: () => void;
  saveError: string | null;
  authError: string | null;
  onDismissSaveError: () => void;
  onDismissAuthError: () => void;
  saveToast: { message: string; undo: () => void } | null;
}

export default function MapNotices({
  showFirstRunHint,
  isLoading,
  onDismissFirstRunHint,
  saveError,
  authError,
  onDismissSaveError,
  onDismissAuthError,
  saveToast,
}: MapNoticesProps) {
  return (
    <>
      {/* There is no onboarding anywhere in the product: a first-time
          visitor on a phone sees a spinning map, a hamburger and nothing
          else. One dismissible line, shown once, is the smallest thing that
          fixes that without becoming a tour. */}
      {showFirstRunHint && !isLoading && !saveError && !authError && (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-slate-900/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur">
            <p className="text-xs text-slate-300">
              <span className="font-semibold text-white md:hidden">Tap the menu</span>
              <span className="hidden font-semibold text-white md:inline">
                Pick a route from the list
              </span>{' '}
              to see readiness, weather and gear for any trail.
            </p>
            <button
              type="button"
              onClick={onDismissFirstRunHint}
              aria-label="Dismiss tip"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Saving and signing in can both be triggered from the sidebar, the
          map or a modal, so their failure notices live somewhere all three
          can be seen. One slot, so they never stack up and compete. */}
      {(saveError || authError) && (
        <div
          role="alert"
          className="absolute inset-x-0 top-6 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border border-amber-500/30 bg-slate-900/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur"
        >
          <span className="text-xs text-amber-100">{saveError ?? authError}</span>
          <button
            type="button"
            onClick={() => {
              onDismissSaveError();
              onDismissAuthError();
            }}
            aria-label="Dismiss"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Save confirmation with a way back. Yields to the error toast, which
          is the more urgent thing to say. */}
      {saveToast && !saveError && !authError && (
        <div
          role="status"
          className="absolute inset-x-0 top-6 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-full border border-white/10 bg-slate-900/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur"
        >
          <span className="text-xs text-slate-200">{saveToast.message}</span>
          <button
            type="button"
            onClick={saveToast.undo}
            className={`${buttonGhost} ${buttonSize.sm} text-blue-400 hover:text-blue-300`}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
