'use client';

import '@xyflow/react/dist/style.css';

import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { useMemo } from 'react';

import type { Diagram, NodeKind } from '@/lib/aboutDiagrams';

const KIND_STYLE: Record<NodeKind, { background: string; border: string }> = {
  client: { background: '#1e3a8a', border: '#60a5fa' },
  server: { background: '#312e81', border: '#a5b4fc' },
  store: { background: '#064e3b', border: '#6ee7b7' },
  external: { background: '#431407', border: '#fdba74' },
  logic: { background: '#3b0764', border: '#d8b4fe' },
};

interface Props {
  diagram: Diagram;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * The React Flow canvas for one diagram. Read-only: boxes cannot be dragged or
 * connected, only selected, because the layout is the explanation. The same
 * facts are listed as text beside it, since a canvas is not reachable by a
 * screen reader.
 */
export default function DiagramCanvas({ diagram, selectedId, onSelect }: Props) {
  const nodes = useMemo<Node[]>(
    () =>
      diagram.nodes.map((n) => {
        const style = KIND_STYLE[n.kind];
        const selected = n.id === selectedId;
        return {
          id: n.id,
          position: { x: n.x, y: n.y },
          data: { label: n.label },
          style: {
            width: 200,
            padding: 10,
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            color: '#f8fafc',
            background: style.background,
            border: `${selected ? 3 : 1}px solid ${style.border}`,
          },
        };
      }),
    [diagram, selectedId]
  );

  const edges = useMemo<Edge[]>(
    () =>
      diagram.edges.map((e, i) => ({
        id: `${e.from}-${e.to}-${i}`,
        source: e.from,
        target: e.to,
        label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        style: { stroke: '#94a3b8' },
        labelStyle: { fill: '#cbd5e1', fontSize: 11 },
        labelBgStyle: { fill: '#0f172a' },
      })),
    [diagram]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: false }}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      aria-label={`${diagram.title} diagram`}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
