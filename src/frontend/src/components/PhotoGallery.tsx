'use client';

import { Camera, ImageOff } from 'lucide-react';
import Image from 'next/image';

interface PhotoGalleryProps {
  photos: string[];
  loading: boolean;
  /** True only when the request itself failed, not when a place has no photos. */
  failed: boolean;
  /** Used for alt text. */
  placeName: string;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-ink/[0.08] bg-ink/[0.03] py-8">
      <div className="px-4 text-center">{children}</div>
    </div>
  );
}

/**
 * Place photos, with the three states kept distinct.
 *
 * This block was copy-pasted three times inside DetailsModal — once per branch
 * — and in all three copies a failed Places request fell through to the same
 * "No photos available" as a place that genuinely has none. Those are different
 * facts and now read differently.
 */
export function PhotoGallery({ photos, loading, failed, placeName }: PhotoGalleryProps) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-300">
        <Camera aria-hidden="true" className="h-3.5 w-3.5" />
        Photos
      </h3>

      {loading ? (
        <Frame>
          <div
            role="status"
            aria-label="Loading photos"
            className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-ink/10 border-t-slate-400"
          />
          <p className="text-sm text-slate-400">Loading photos…</p>
        </Frame>
      ) : photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.slice(0, 6).map((photo, index) => (
            <div
              key={photo}
              className="group relative aspect-square overflow-hidden rounded-lg bg-ink/[0.03]"
            >
              <Image
                src={photo}
                alt={`${placeName} — photo ${index + 1}`}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 33vw"
              />
            </div>
          ))}
        </div>
      ) : failed ? (
        <Frame>
          <ImageOff aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-amber-400/70" />
          <p className="text-sm text-slate-300">Photos couldn&apos;t be loaded</p>
          <p className="mt-1 text-xs text-slate-500">Reopening this place usually works.</p>
        </Frame>
      ) : (
        <Frame>
          <Camera aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-slate-600" />
          <p className="text-sm text-slate-400">No photos available</p>
        </Frame>
      )}
    </div>
  );
}
