'use client';

import dynamic from 'next/dynamic';
import { useId, useState } from 'react';

import { DIAGRAMS, KIND_LABEL } from '@/lib/aboutDiagrams';

// React Flow measures the DOM, so it renders in the browser only. The
// placeholder keeps the page from jumping when it arrives.
const DiagramCanvas = dynamic(() => import('./DiagramCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      Loading diagram…
    </div>
  ),
});

/**
 * Tabs over the diagrams, the canvas, a panel for the selected box, and the
 * whole diagram again as a list. The list is not decoration: it is how a
 * keyboard or screen-reader user gets the same explanation.
 */
export function AboutDiagrams() {
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const baseId = useId();
  const diagram = DIAGRAMS[index];
  const selected = diagram.nodes.find((n) => n.id === selectedId) ?? null;
  const label = (id: string) => diagram.nodes.find((n) => n.id === id)?.label ?? id;

  function choose(next: number) {
    setIndex(next);
    setSelectedId(null);
  }

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = DIAGRAMS.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? i === last
          ? 0
          : i + 1
        : e.key === 'ArrowLeft'
          ? i === 0
            ? last
            : i - 1
          : null;
    if (next === null) return;
    e.preventDefault();
    choose(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Diagrams" className="flex flex-wrap gap-2">
        {DIAGRAMS.map((d, i) => (
          <button
            key={d.id}
            id={`${baseId}-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={i === index}
            aria-controls={`${baseId}-panel`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => choose(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none ${
              i === index
                ? 'border-blue-400 bg-blue-600/20 text-white'
                : 'border-ink/15 text-slate-400 hover:text-white'
            }`}
          >
            {d.title}
          </button>
        ))}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${index}`}>
        <p className="mt-4 text-sm text-slate-300">{diagram.summary}</p>

        <div className="border-ink/15 mt-4 h-[460px] overflow-hidden rounded-xl border bg-slate-900">
          <DiagramCanvas diagram={diagram} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div
          aria-live="polite"
          className="border-ink/10 bg-ink/[0.03] mt-3 min-h-[4.5rem] rounded-lg border p-3 text-sm"
        >
          {selected ? (
            <>
              <p className="font-semibold text-white">
                {selected.label}{' '}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  {KIND_LABEL[selected.kind]}
                </span>
              </p>
              <p className="mt-1 text-slate-300">{selected.detail}</p>
            </>
          ) : (
            <p className="text-slate-400">Select a box to see what it does.</p>
          )}
        </div>

        <details className="mt-4 text-sm text-slate-300">
          <summary className="cursor-pointer text-slate-400 hover:text-white">
            Read this diagram as text
          </summary>
          <ul className="mt-3 space-y-3">
            {diagram.nodes.map((n) => (
              <li key={n.id}>
                <strong className="text-white">{n.label}</strong>{' '}
                <span className="text-xs text-slate-500">({KIND_LABEL[n.kind]})</span>
                <br />
                {n.detail}
                {diagram.edges.some((e) => e.from === n.id) && (
                  <span className="block text-slate-400">
                    Goes to:{' '}
                    {diagram.edges
                      .filter((e) => e.from === n.id)
                      .map((e) => (e.label ? `${label(e.to)} (${e.label})` : label(e.to)))
                      .join('; ')}
                    .
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
