import { Bookmark, Mountain as MountainIcon, Tent } from 'lucide-react';

interface MapLegendProps {
  hasMountains: boolean;
  hasCampsites: boolean;
  hasSaved: boolean;
  hasPreciseLocation: boolean;
}

/**
 * Bottom-left, so it does not stack under the zoom control or the chat button,
 * which both sit on the right.
 */
export default function MapLegend({
  hasMountains,
  hasCampsites,
  hasSaved,
  hasPreciseLocation,
}: MapLegendProps) {
  return (
    <div className="absolute bottom-24 left-4 hidden rounded-xl border border-ink/10 bg-slate-900/90 p-4 shadow-xl backdrop-blur sm:block">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Legend
      </h3>
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Route Difficulty
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-slate-300">Easy</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-500" />
              <span className="text-slate-300">Moderate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-slate-300">Hard</span>
            </div>
          </div>
        </div>
        {(hasMountains || hasCampsites) && (
          <div className="border-t border-ink/10 pt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Points of Interest
            </p>
            <div className="space-y-1 text-xs">
              {hasMountains && (
                <div className="flex items-center gap-2">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-900">
                    <MountainIcon aria-hidden="true" size={10} color="white" />
                  </div>
                  <span className="text-slate-300">Mountain/Peak</span>
                </div>
              )}
              {hasCampsites && (
                <div className="flex items-center gap-2">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-700">
                    <Tent aria-hidden="true" size={10} color="white" />
                  </div>
                  <span className="text-slate-300">Campsite</span>
                </div>
              )}
              {hasSaved && (
                <div className="flex items-center gap-2">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-600">
                    <Bookmark aria-hidden="true" size={9} color="white" fill="white" />
                  </div>
                  <span className="text-slate-300">Saved</span>
                </div>
              )}
              {hasPreciseLocation && (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-slate-300">Your Location</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
