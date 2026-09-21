import { useState } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  Position,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '../src/index.ts';

function CustomPlanNode({ data, selected }: NodeProps) {
  const d = data as { label: string; kind: string; detail?: string; highlighted?: boolean };
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center shadow-lg transition-all duration-150 min-w-36 ${
        selected ? 'outline outline-2 outline-offset-2 outline-sky-400' : ''
      } ${
        d.highlighted
          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200 ring-2 ring-emerald-500/50'
          : 'border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500'
      }`}
    >
      <Handle id="in" type="target" position={Position.Top} className="text-slate-500" />
      <Handle id="prev" type="target" position={Position.Left} className="text-slate-500" />
      <div className="font-mono text-sm font-semibold">{d.label}</div>
      <div className="text-xs uppercase tracking-wider text-slate-400">{d.kind}</div>
      {d.detail && <div className="mt-1 font-mono text-xs text-slate-400">{d.detail}</div>}
      <Handle id="out" type="source" position={Position.Bottom} className="text-slate-500" />
      <Handle id="next" type="source" position={Position.Right} className="text-slate-500" />
    </div>
  );
}

/** A custom edge: the default drawing, plus a pill of text riding on the curve. */
function CostEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const text = String(data?.cost ?? '');
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      <rect x={labelX - 28} y={labelY - 10} width={56} height={20} rx={10} fill="#0f172a" stroke="#475569" />
      <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#cbd5e1">
        {text}
      </text>
    </>
  );
}

const nodeTypes = {
  plan: CustomPlanNode,
};
const edgeTypes = {
  cost: CostEdge,
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
    type: 'cost',
    data: { cost: 'cost 12' },
    source: '1',
    target: '2',
    sourceHandle: 'out',
    targetHandle: 'in',
    markerEnd: 'arrowclosed',
    style: { stroke: '#64748b', strokeWidth: 2 },
  },
  {
    id: 'e1-3',
    source: '1',
    target: '3',
    sourceHandle: 'out',
    targetHandle: 'in',
    className: 'is-active',
    label: '10 rows',
    markerEnd: 'arrowclosed',
    style: { stroke: '#10b981', strokeWidth: 2 },
  },
  {
    id: 'e3-4',
    source: '3',
    target: '4',
    sourceHandle: 'out',
    targetHandle: 'in',
    className: 'is-active',
    markerEnd: 'arrowclosed',
    style: { stroke: '#10b981', strokeWidth: 2 },
  },
  {
    id: 'e2-3-side',
    source: '2',
    target: '3',
    sourceHandle: 'next',
    targetHandle: 'prev',
    markerEnd: 'arrow',
    style: { stroke: '#38bdf8', strokeWidth: 1.5, strokeDasharray: '3 3' },
  },
];

const edgeId = (c: Connection) => `${c.source}:${String(c.sourceHandle)}->${c.target}:${String(c.targetHandle)}`;

export function App() {
  const [nodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selected, setSelected] = useState<string[]>([]);

  // A connection is only a request: the engine never edits `edges`, so add it here —
  // unless it joins a node to itself, or repeats an edge that already exists.
  const existing = new Set(
    edges.map((e) =>
      edgeId({ source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null }),
    ),
  );
  const isValidConnection = (c: Connection) => c.source !== c.target && !existing.has(edgeId(c));
  const onConnect = (c: Connection) => {
    setEdges((all) => [
      ...all,
      { id: edgeId(c), ...c, markerEnd: 'arrowclosed', style: { stroke: '#a78bfa', strokeWidth: 2 } },
    ]);
  };

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Header bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="font-bold text-emerald-400">Flowinger</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">v0.1.0</span>
          <span className="hidden whitespace-nowrap text-xs text-slate-500 sm:inline">· Pure React & SVG Node Graph Renderer</span>
        </div>
        <div className="hidden text-xs text-slate-400 md:block">
          Scroll or pinch to zoom · Drag background to pan · Drag nodes to move · Drag from a dot to connect · Click to select
        </div>
      </header>

      {/* Main Canvas Area */}
      <div className="relative flex-1 bg-slate-950">
        <FlowingerProvider>
          <FlowingerCanvas
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={true}
            nodesConnectable
            elementsSelectable
            isValidConnection={isValidConnection}
            onConnect={onConnect}
            onSelectionChange={({ nodes: picked }) => { setSelected(picked.map((n) => String((n.data as { label?: string }).label ?? n.id))); }}
            onInit={(flow) => { flow.fitView(); }}
            keyboardNavigation
            ariaLabel="Query plan"
            minZoom={0.2}
            maxZoom={2.0}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
          </FlowingerCanvas>
          <div className="pointer-events-none absolute left-3 top-3 z-50 text-xs text-slate-400">
            {selected.length > 0 ? `Selected: ${selected.join(', ')}` : 'Nothing selected'}
            <span className="ml-2 text-slate-600">{edges.length} edges</span>
          </div>
          <div className="absolute bottom-4 left-4 z-50">
            <MiniMap width={160} height={110} nodeColor={(n) => (n.data.highlighted ? '#10b981' : '#64748b')} />
          </div>
          <div className="absolute bottom-4 right-4 z-50">
            <Controls />
          </div>
        </FlowingerProvider>
      </div>
    </div>
  );
}
