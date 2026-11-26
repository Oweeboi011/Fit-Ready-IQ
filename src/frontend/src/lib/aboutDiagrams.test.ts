import { describe, expect, it } from 'vitest';

import { DIAGRAMS } from './aboutDiagrams';

describe('the /about diagrams', () => {
  it('has unique diagram ids and titles', () => {
    expect(new Set(DIAGRAMS.map((d) => d.id)).size).toBe(DIAGRAMS.length);
    expect(new Set(DIAGRAMS.map((d) => d.title)).size).toBe(DIAGRAMS.length);
  });

  for (const diagram of DIAGRAMS) {
    describe(diagram.title, () => {
      const ids = diagram.nodes.map((n) => n.id);

      it('has unique node ids', () => {
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('only draws edges between boxes that exist', () => {
        for (const e of diagram.edges) {
          expect(ids, `edge source ${e.from}`).toContain(e.from);
          expect(ids, `edge target ${e.to}`).toContain(e.to);
        }
      });

      it('leaves no box disconnected', () => {
        for (const n of diagram.nodes) {
          const linked = diagram.edges.some((e) => e.from === n.id || e.to === n.id);
          expect(linked, `${n.id} has no edge`).toBe(true);
        }
      });

      it('explains every box', () => {
        for (const n of diagram.nodes) {
          expect(n.label.trim()).not.toBe('');
          expect(n.detail.trim().length).toBeGreaterThan(20);
        }
      });

      it('does not stack two boxes on the same spot', () => {
        const spots = diagram.nodes.map((n) => `${n.x},${n.y}`);
        expect(new Set(spots).size).toBe(spots.length);
      });
    });
  }
});
