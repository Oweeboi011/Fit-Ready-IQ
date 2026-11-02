import type { CollectionName } from '@/lib/usePlacesData';
import { buttonGhost, buttonSize } from '@/lib/ui';

interface CollectionStatusNoticesProps {
  failedCollections: CollectionName[];
  collectionLabels: Record<CollectionName, string>;
  onRetry: () => void;
}

export default function CollectionStatusNotices({
  failedCollections,
  collectionLabels,
  onRetry,
}: CollectionStatusNoticesProps) {
  return (
    <>
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
