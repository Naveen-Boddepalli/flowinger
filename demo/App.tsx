import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  NodeResizer,
  NodeToolbar,
  Panel,
  Position,
  ViewportPortal,
  addEdge,
  getBezierPath,
  reconnectEdge,
  useEdgesState,
  useKeyPress,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '../src/index.ts';

type PlanData = { label: string; kind: string; detail?: string; highlighted?: boolean };

const button =
  'rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-200 hover:border-slate-400';

/** A plan operator: handles on four sides, and a toolbar that appears while it is the only thing selected. */
function PlanNode({ id, data, selected }: NodeProps) {
  const d = data as PlanData;
  const { deleteElements, getNode, addNodes } = useReactFlow();
  const duplicate = () => {
    const from = getNode(id);
    if (!from) return;
    addNodes({ ...from, id: `${id}-copy-${String(Date.now())}`, selected: false, position: { x: from.position.x + 30, y: from.position.y + 30 } });
  };
  return (
    <div
      className={`min-w-36 rounded-lg border px-3 py-2 text-center shadow-lg transition-colors duration-150 ${
        selected ? 'outline outline-2 outline-offset-2 outline-sky-400' : ''
      } ${
        d.highlighted
          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
          : 'border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500'
      }`}
    >
      <NodeToolbar>
        <div className="flex gap-1 rounded-md border border-slate-700 bg-slate-900 p-1 shadow-lg">
          <button type="button" className={button} onClick={duplicate}>
            Duplicate
          </button>
          <button type="button" className={button} onClick={() => void deleteElements({ nodes: [{ id }] })}>
            Delete
          </button>
        </div>
      </NodeToolbar>
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

/** A box other nodes live inside — resizable while it is selected. */
function GroupNode({ data, selected }: NodeProps) {
  return (
    <div className="h-full w-full rounded-xl border border-dashed border-slate-600 bg-slate-900/40">
      <NodeResizer minWidth={220} minHeight={140} isVisible={selected === true} />
      <div className="px-3 py-1.5 text-xs uppercase tracking-wider text-slate-400">{String((data as PlanData).label)}</div>
    </div>
  );
}

/** An edge with an HTML label — a real button — drawn above it. */
function CostEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const { updateEdge } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`nodrag nopan ${button}`}
          style={{
            position: 'absolute',
            pointerEvents: 'all',
            transform: `translate(-50%, -50%) translate(${String(labelX)}px, ${String(labelY)}px)`,
          }}
          onClick={() => {
            updateEdge(id, (e) => ({ animated: !e.animated }));
          }}
        >
          {String(data?.cost ?? '')} · animate
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { plan: PlanNode, group: GroupNode };
const edgeTypes = { cost: CostEdge };

const plan = (id: string, x: number, y: number, data: PlanData, extra: Partial<Node> = {}): Node => ({
  id,
  type: 'plan',
  position: { x, y },
  data,
  ...extra,
});

const initialNodes: Node[] = [
  { id: 'block', type: 'group', position: { x: 40, y: 140 }, width: 520, height: 300, data: { label: 'Subquery' } },
  plan('1', 250, 20, { label: 'IndexScan', kind: 'PLAN OPERATOR', detail: 'idx_users_email', highlighted: true }),
  // Drag Filter past the box's edge: the box grows to hold it (it has no `extent: 'parent'` to stop it).
  plan('2', 40, 60, { label: 'Filter', kind: 'PLAN OPERATOR', detail: 'active = true' }, { parentId: 'block', expandParent: true }),
  plan('3', 280, 60, { label: 'Projection', kind: 'PLAN OPERATOR', detail: 'id, name, email', highlighted: true }, { parentId: 'block', extent: 'parent' }),
  plan('4', 280, 500, { label: 'Output', kind: 'SINK', detail: '10 rows', highlighted: true }),
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
    label: '10 rows',
    animated: true,
    markerEnd: 'arrowclosed',
    style: { stroke: '#10b981', strokeWidth: 2 },
  },
  { id: 'e3-4', source: '3', target: '4', sourceHandle: 'out', targetHandle: 'in', markerEnd: 'arrowclosed', style: { stroke: '#10b981', strokeWidth: 2 } },
  { id: 'e2-3-side', source: '2', target: '3', sourceHandle: 'next', targetHandle: 'prev', markerEnd: 'arrow', style: { stroke: '#38bdf8', strokeWidth: 1.5 } },
];

/** A big grid of small nodes, for watching what `onlyRenderVisibleElements` saves. */
function bigGrid(count: number): Node[] {
  const side = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => ({
    id: `g${String(i)}`,
    position: { x: (i % side) * 180, y: Math.floor(i / side) * 70 },
    width: 140,
    data: { label: `node ${String(i)}` },
  }));
}

/** Whether Shift is held — a `useKeyPress` readout, and a Shift-drag draws a selection box. */
function ShiftState() {
  const shift = useKeyPress('Shift');
  return <span data-testid="shift">{shift ? 'Shift held: drag to box-select' : 'Hold Shift to box-select'}</span>;
}

/** How many nodes are in the document right now. */
function DomCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const read = () => { setCount(document.querySelectorAll('.react-flow__node').length); };
    read();
    const timer = setInterval(read, 400);
    return () => { clearInterval(timer); };
  }, []);
  return <span data-testid="dom-count">{count} nodes in the DOM</span>;
}

const edgeId = (c: Connection) => `${c.source}:${String(c.sourceHandle)}->${c.target}:${String(c.targetHandle)}`;

export function App() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [picked, setPicked] = useState('nothing selected');
  const [boxSelect, setBoxSelect] = useState(false);
  const [snap, setSnap] = useState(false);
  const [many, setMany] = useState(false);
  const stress = useMemo(() => bigGrid(2000), []);

  const isValidConnection = (c: Connection) => c.source !== c.target;
  const onReconnect = useCallback(
    (old: Edge, next: Connection) => {
      setEdges((all) => reconnectEdge(old, next, all));
    },
    [setEdges],
  );
  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((all) =>
        addEdge({ id: edgeId(c), ...c, markerEnd: 'arrowclosed', style: { stroke: '#a78bfa', strokeWidth: 2 } }, all),
      );
    },
    [setEdges],
  );

  return (
    <div className="relative flex h-full w-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="font-bold text-emerald-400">Flowinger</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">v0.1.0</span>
          <span className="hidden whitespace-nowrap text-xs text-slate-500 sm:inline">· Pure React & SVG Node Graph Renderer</span>
        </div>
        <div className="hidden text-xs text-slate-400 md:block">
          Scroll or double-click to zoom · Drag to pan · Shift-drag to box-select · Select an edge to move its ends · Backspace deletes
        </div>
      </header>

      <div className="relative flex-1 bg-slate-950">
        <FlowingerProvider>
          <FlowingerCanvas
            nodes={many ? stress : nodes}
            edges={many ? [] : edges}
            {...(many ? {} : { onNodesChange, onEdgesChange })}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable
            nodesConnectable
            elementsSelectable
            selectionOnDrag={boxSelect}
            panOnDrag={boxSelect ? [1, 2] : true}
            panOnScroll={boxSelect}
            snapToGrid={snap}
            snapGrid={[20, 20]}
            onlyRenderVisibleElements={many}
            fitView
            isValidConnection={isValidConnection}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onSelectionChange={({ nodes: n, edges: e }) => {
              setPicked(n.length + e.length === 0 ? 'nothing selected' : `${String(n.length)} nodes, ${String(e.length)} edges selected`);
            }}
            keyboardNavigation
            ariaLabel="Query plan"
            minZoom={0.05}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
            {/* Drawn in graph space, above the nodes: a marker at the origin. */}
            <ViewportPortal>
              <div
                data-testid="origin"
                className="text-[10px] text-slate-600"
                style={{ position: 'absolute', transform: 'translate(-50%, -50%)' }}
              >
                + origin
              </div>
            </ViewportPortal>
            <Panel position="top-right">
              <div className="flex flex-col gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 p-2.5 text-xs text-slate-300 shadow-lg">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={boxSelect} onChange={(e) => { setBoxSelect(e.target.checked); }} />
                  Drag to box-select
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={snap} onChange={(e) => { setSnap(e.target.checked); }} />
                  Snap to 20px grid
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={many} onChange={(e) => { setMany(e.target.checked); }} />
                  2,000 nodes, drawn only in view
                </label>
                <div className="text-slate-500" data-testid="picked">{picked}</div>
                <div className="text-slate-500"><ShiftState /></div>
                <div className="text-slate-500">
                  <DomCount />
                </div>
              </div>
            </Panel>
          </FlowingerCanvas>
          <div className="absolute bottom-4 left-4 z-50">
            <MiniMap width={160} height={110} nodeColor={(n) => ((n.data as PlanData).highlighted ? '#10b981' : '#64748b')} />
          </div>
          <div className="absolute bottom-4 right-4 z-50">
            <Controls />
          </div>
        </FlowingerProvider>
      </div>
    </div>
  );
}
