'use client';

import { Check, CircleDashed, Clock, Lightbulb, TriangleAlert, Compass } from 'lucide-react';
import { useMemo, useState } from 'react';

import Modal from '@/components/Modal';
import {
  CHALLENGES,
  CONSIDERATIONS,
  RECOMMENDATIONS,
  ROADMAP,
  type ItemStatus,
  type RoadmapNote,
} from '@/lib/roadmap';

const STATUS_META: Record<
  ItemStatus,
  { label: string; dot: string; text: string; Icon: typeof Check }
> = {
  done: { label: 'Shipped', dot: 'bg-emerald-500', text: 'text-emerald-300', Icon: Check },
  partial: { label: 'Partial', dot: 'bg-amber-500', text: 'text-amber-300', Icon: Clock },
  pending: { label: 'Next', dot: 'bg-slate-600', text: 'text-slate-400', Icon: CircleDashed },
};

type View = 'progress' | 'notes';

function NoteList({
  notes,
  Icon,
  tone,
}: {
  notes: RoadmapNote[];
  Icon: typeof Lightbulb;
  tone: string;
}) {
  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li
          key={note.title}
          className="rounded-xl border border-ink/[0.06] bg-slate-800/40 px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Icon aria-hidden="true" className={`h-3.5 w-3.5 flex-shrink-0 ${tone}`} />
            <p className="text-xs font-semibold text-slate-200">{note.title}</p>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{note.body}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Release roadmap.
 *
 * Reads from `lib/roadmap.ts`, which sits next to the code it describes so a
 * status can be checked against the repo instead of drifting the way a slide
 * would. Pending items name what is genuinely missing.
 */
export default function RoadmapModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>('progress');

  const counts = useMemo(() => {
    const all = ROADMAP.flatMap((p) => p.items);
    return {
      total: all.length,
      done: all.filter((i) => i.status === 'done').length,
      partial: all.filter((i) => i.status === 'partial').length,
    };
  }, []);

  const percent = Math.round(((counts.done + counts.partial * 0.5) / counts.total) * 100);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
            <Compass aria-hidden="true" className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Release roadmap</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {counts.done} of {counts.total} shipped
              {counts.partial > 0 && ` · ${counts.partial} partial`}
            </p>
          </div>
        </div>
      }
    >
      <div className="p-5">
        <div className="mb-5">
          <div
            role="img"
            aria-label={`Roadmap ${percent} per cent complete`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Roadmap view"
          className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-ink/[0.06] bg-ink/[0.03] p-1"
        >
          {(
            [
              ['progress', 'Progress'],
              ['notes', 'Notes & next steps'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`min-h-11 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                view === id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:bg-ink/5 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'progress' ? (
          <div className="space-y-6">
            {ROADMAP.map((phase) => (
              <section key={phase.id}>
                <h3 className="text-sm font-semibold text-white">{phase.title}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{phase.goal}</p>

                <ul className="mt-3 space-y-1.5">
                  {phase.items.map((item) => {
                    const meta = STATUS_META[item.status];
                    return (
                      <li
                        key={item.title}
                        className="flex gap-3 rounded-xl border border-ink/[0.06] bg-slate-800/40 px-3 py-2.5"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${meta.dot}`}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <p className="text-xs font-medium text-slate-200">{item.title}</p>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${meta.text}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                            {item.detail}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-white">Design considerations</h3>
              <NoteList notes={CONSIDERATIONS} Icon={Lightbulb} tone="text-blue-400" />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-white">Known challenges</h3>
              <NoteList notes={CHALLENGES} Icon={TriangleAlert} tone="text-amber-400" />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-white">Recommendations</h3>
              <NoteList notes={RECOMMENDATIONS} Icon={Compass} tone="text-emerald-400" />
            </section>
          </div>
        )}
      </div>
    </Modal>
  );
}
