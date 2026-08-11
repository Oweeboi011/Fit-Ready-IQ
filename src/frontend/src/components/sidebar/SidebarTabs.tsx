import { Mountain, Tent, Route, Clock, Bookmark } from 'lucide-react';
import type { Route as RouteData, Mountain as MountainData, Campsite } from '@/lib/placesTypes';
import type { SavedPlace } from '@/lib/useSavedPlaces';
import type { Activity } from '@/lib/activityTypes';

export type TabId = 'routes' | 'mountains' | 'campsites' | 'history' | 'saved';

const TABS = [
  {
    id: 'routes' as const,
    label: 'Routes',
    Icon: Route,
    activeClass: 'bg-blue-600 text-white shadow-lg shadow-blue-900/50',
  },
  {
    id: 'mountains' as const,
    label: 'Peaks',
    Icon: Mountain,
    activeClass: 'bg-slate-600 text-white shadow-lg shadow-slate-900/50',
  },
  {
    id: 'campsites' as const,
    label: 'Camps',
    Icon: Tent,
    activeClass: 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50',
  },
  {
    id: 'history' as const,
    label: 'History',
    Icon: Clock,
    activeClass: 'bg-violet-600 text-white shadow-lg shadow-violet-900/50',
  },
];

const SAVED_TAB = {
  id: 'saved' as const,
  label: 'Saved',
  Icon: Bookmark,
  activeClass: 'bg-amber-600 text-white shadow-lg shadow-amber-900/50',
};

function tabCount(
  tabId: TabId,
  matches: (name: string) => boolean,
  data: {
    filteredRoutes: RouteData[];
    mountains: MountainData[];
    campsites: Campsite[];
    savedPlaces: SavedPlace[];
    activities: Activity[];
  }
): number {
  switch (tabId) {
    case 'routes':
      return data.filteredRoutes.filter((r) => matches(r.name)).length;
    case 'mountains':
      return data.mountains.filter((m) => matches(m.name)).length;
    case 'campsites':
      return data.campsites.filter((c) => matches(c.name)).length;
    case 'saved':
      return data.savedPlaces.filter((p) => matches(p.name)).length;
    case 'history':
      return data.activities.filter((a) => matches(a.name)).length;
  }
}

interface SidebarTabsProps {
  isAuthed: boolean;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onTabKeyDown: (event: React.KeyboardEvent, tabId: TabId) => void;
  searchQuery: string;
  filteredRoutes: RouteData[];
  mountains: MountainData[];
  campsites: Campsite[];
  savedPlaces: SavedPlace[];
  activities: Activity[];
}

// These were bare buttons conveying selection by colour alone, with no role,
// no aria-selected and a 26px hit area.
//
// An equal-width grid then crushed each tab to ~69px in a 291px sidebar,
// which is not enough for an icon, a label and a count, so the counts
// clipped. Each tab now takes the width it needs and the strip scrolls.
// `flex-shrink-0` matters: the sidebar is a flex column and would otherwise
// compress this row to a sliver.
export default function SidebarTabs({
  isAuthed,
  activeTab,
  onSelectTab,
  onTabKeyDown,
  searchQuery,
  filteredRoutes,
  mountains,
  campsites,
  savedPlaces,
  activities,
}: SidebarTabsProps) {
  const tabs = isAuthed ? [...TABS, SAVED_TAB] : TABS;
  const matches = (name: string) =>
    !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div
      role="tablist"
      aria-label="Browse places and activities"
      className="sidebar-tabs flex flex-shrink-0 gap-0.5 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/5 p-1"
    >
      {tabs.map((tab) => {
        const count = tabCount(tab.id, matches, {
          filteredRoutes,
          mountains,
          campsites,
          savedPlaces,
          activities,
        });
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls="tab-panel"
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(e) => onTabKeyDown(e, tab.id)}
            className={`flex min-h-11 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              activeTab === tab.id
                ? tab.activeClass
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <tab.Icon aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
            {tab.label}
            {count > 0 && (
              <span
                className={`font-tabular rounded-full px-1.5 py-px text-[9px] font-bold leading-none ${
                  activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-white/10 text-slate-400'
                }`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
