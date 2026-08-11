import { X, MapPinOff } from 'lucide-react';
import {
  locationProblemMessage,
  type LocationProblem,
  type LocationSource,
} from '@/lib/useUserLocation';
import { buttonGhost, buttonSecondary, buttonSize } from '@/lib/ui';

interface LocationNoticeProps {
  problem: LocationProblem;
  source: LocationSource | null;
  onDismiss: () => void;
  onRetry: () => void;
  onSearchInstead: () => void;
}

// Location failed — say so, rather than silently searching elsewhere.
export default function LocationNotice({
  problem,
  source,
  onDismiss,
  onRetry,
  onSearchInstead,
}: LocationNoticeProps) {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5"
    >
      <div className="flex items-start gap-2">
        <MapPinOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
        <p className="flex-1 text-[11px] leading-relaxed text-amber-100">
          {locationProblemMessage(problem, source)}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss location notice"
          className="-m-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-amber-400/70 hover:text-amber-200"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onRetry} className={`${buttonSecondary} ${buttonSize.sm}`}>
          Try again
        </button>
        <button
          type="button"
          onClick={onSearchInstead}
          className={`${buttonGhost} ${buttonSize.sm}`}
        >
          Search a place
        </button>
      </div>
    </div>
  );
}
