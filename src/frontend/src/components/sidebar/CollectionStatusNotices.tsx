import type { CollectionName } from '@/lib/usePlacesData';
import { buttonGhost, buttonSize } from '@/lib/ui';

interface CollectionStatusNoticesProps {
  elevationUnavailable: boolean;
  failedCollections: CollectionName[];
  collectionLabels: Record<CollectionName, string>;
  onRetry: () => void;
}

export default function CollectionStatusNotices({
  elevationUnavailable,
  failedCollections,
  collectionLabels,
  onRetry,
}: CollectionStatusNoticesProps) {
  return (
    <>
      {elevationUnavailable && (
        <div
          role="status"
          className="mb-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5"
        >
          <p className="text-[11px] leading-relaxed text-amber-100">
            Elevation data is unavailable right now, so climbs and gains are shown as
            &ldquo;—&rdquo; rather than guessed.
          </p>
        </div>
      )}

      {/* Partial failure: some collections came back, some did not. Without
          this the empty tab reads as "nothing here". */}
      {failedCollections.length > 0 && (
        <div
          role="status"
          className="mb-1.5 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5"
        >
          <p className="flex-1 text-[11px] text-amber-100">
            We couldn&apos;t load {failedCollections.map((c) => collectionLabels[c]).join(' or ')}.
          </p>
          <button type="button" onClick={onRetry} className={`${buttonGhost} ${buttonSize.sm}`}>
            Retry
          </button>
        </div>
      )}
    </>
  );
}
