import { useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from '../src/index.ts';

function CustomPlanNode({ data }: NodeProps) {
  const d = data as { label: string; kind: string; detail?: string; highlighted?: boolean };
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center shadow-lg transition-all duration-150 min-w-36 ${
        d.highlighted
          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200 ring-2 ring-emerald-500/50'
          : 'border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500'
      }`}
    >
      <Handle id="in" type="target" position={Position.Top} className="!opacity-0" />
      <Handle id="prev" type="target" position={Position.Left} className="!opacity-0" />
      <div className="font-mono text-sm font-semibold">{d.label}</div>
      <div className="text-xs uppercase tracking-wider text-slate-400">{d.kind}</div>
      {d.detail && <div className="mt-1 font-mono text-xs text-slate-400">{d.detail}</div>}
      <Handle id="out" type="source" position={Position.Bottom} className="!opacity-0" />
      <Handle id="next" type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}

const nodeTypes = {
  plan: CustomPlanNode,
};

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'plan',
    position: { x: 300, y: 50 },
    data: { label: 'IndexScan', kind: 'PLAN OPERATOR', detail: 'idx_users_email', highlighted: true },
    draggable: true,
  },
  {
    id: '2',
    type: 'plan',
    position: { x: 150, y: 180 },
    data: { label: 'Filter', kind: 'PLAN OPERATOR', detail: 'active = true' },
    draggable: true,
  },
  {
    id: '3',
    type: 'plan',
    position: { x: 450, y: 180 },
    data: { label: 'Projection', kind: 'PLAN OPERATOR', detail: 'id, name, email', highlighted: true },
    draggable: true,
  },
  {
    id: '4',
    type: 'plan',
    position: { x: 450, y: 310 },
    data: { label: 'Output', kind: 'SINK', detail: '10 rows', highlighted: true },
    draggable: true,
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    sourceHandle: 'out',
    targetHandle: 'in',
    style: { stroke: '#64748b', strokeWidth: 2 },
  },
  {
    id: 'e1-3',
    source: '1',
    target: '3',
    sourceHandle: 'out',
    targetHandle: 'in',
    className: 'is-active',
    style: { stroke: '#10b981', strokeWidth: 2 },
  },
  {
    id: 'e3-4',
    source: '3',
    target: '4',
    sourceHandle: 'out',
    targetHandle: 'in',
    className: 'is-active',
    style: { stroke: '#10b981', strokeWidth: 2 },
  },
  {
    id: 'e2-3-side',
    source: '2',
    target: '3',
    sourceHandle: 'next',
    targetHandle: 'prev',
    style: { stroke: '#38bdf8', strokeWidth: 1.5, strokeDasharray: '3 3' },
  },
];

export function App() {
  const [nodes] = useState(initialNodes);
  const [edges] = useState(initialEdges);

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Header bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="font-bold text-emerald-400">Flowinger</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">v0.1.0</span>
          <span className="text-xs text-slate-500">· Pure React & SVG Node Graph Renderer</span>
        </div>
        <div className="text-xs text-slate-400">
          Scroll or pinch to zoom · Drag background to pan · Drag nodes to reposition · Focus the canvas, then arrows / + / − / 0
        </div>
      </header>

      {/* Main Canvas Area */}
      <div className="relative flex-1 bg-slate-950">
        <FlowingerProvider>
          <FlowingerCanvas
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={true}
            keyboardNavigation
            ariaLabel="Query plan"
            minZoom={0.2}
            maxZoom={2.0}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
          </FlowingerCanvas>
          <div className="absolute bottom-4 right-4 z-50">
            <Controls />
          </div>
        </FlowingerProvider>
      </div>
    </div>
  );
}
