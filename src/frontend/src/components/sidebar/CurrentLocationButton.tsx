import { ChevronRight, MapPin } from 'lucide-react';
import type { UserLocation } from '@/lib/useUserLocation';

interface CurrentLocationButtonProps {
  userLocation: UserLocation;
  hasPreciseLocation: boolean;
  isLocating: boolean;
  onFocus: () => void;
}

// Blue "you are here" treatment only for real fixes.
export default function CurrentLocationButton({
  userLocation,
  hasPreciseLocation,
  isLocating,
  onFocus,
}: CurrentLocationButtonProps) {
  return (
    <button
      type="button"
      onClick={onFocus}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
        hasPreciseLocation
          ? 'border-blue-500/20 bg-blue-500/10 hover:border-blue-500/40 hover:bg-blue-500/20'
          : 'border-ink/10 bg-ink/5 hover:border-ink/20 hover:bg-ink/[0.08]'
      }`}
      title={hasPreciseLocation ? 'Focus map on your location' : 'Focus map on this area'}
    >
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg shadow-md ${
          hasPreciseLocation ? 'bg-blue-600 shadow-blue-900/50' : 'bg-slate-700'
        }`}
      >
        <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-medium ${hasPreciseLocation ? 'text-blue-100' : 'text-slate-200'}`}
        >
          {userLocation.address || (isLocating ? 'Getting location…' : 'Selected area')}
        </p>
        <p
          className={`font-tabular text-[10px] ${hasPreciseLocation ? 'text-blue-400/70' : 'text-slate-500'}`}
        >
          {hasPreciseLocation
            ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
            : 'Approximate area'}
        </p>
      </div>
      <ChevronRight
        aria-hidden="true"
        className={`h-3.5 w-3.5 flex-shrink-0 ${hasPreciseLocation ? 'text-blue-400' : 'text-slate-500'}`}
      />
    </button>
  );
}
