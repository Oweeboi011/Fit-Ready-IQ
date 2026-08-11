import type { RefObject } from 'react';
import { Search, X } from 'lucide-react';

interface SidebarSearchBoxProps {
  searchInputRef: RefObject<HTMLInputElement>;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export default function SidebarSearchBox({
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
}: SidebarSearchBoxProps) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 my-auto h-3.5 w-3.5 text-slate-500"
      />
      <input
        ref={searchInputRef}
        type="text"
        aria-label="Search routes, peaks and campsites"
        placeholder="Search routes, peaks, camps…"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        className="focus:bg-white/8 w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-[13px] text-slate-200 placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
      />
      {searchQuery && (
        <button
          onClick={() => onSearchQueryChange('')}
          className="absolute inset-y-0 right-2.5 my-auto flex items-center text-slate-500 hover:text-slate-300"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
