// The editor from "Make it interactive" in docs/getting-started.md, running: drag a node, draw an edge from
// one handle to another, select something and press Backspace. It renders on the server too, so the
// diagram is in the HTML before React loads.
import {
  Background,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from 'flowinger';

function Step({ data, selected }: NodeProps) {
  return (
    <div className={selected ? 'flowinger-step is-selected' : 'flowinger-step'}>
      <Handle type="target" position={Position.Top} />
      {String(data.label)}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { step: Step };

const initialNodes: Node[] = [
  { id: 'scan', type: 'step', position: { x: 0, y: 0 }, data: { label: 'Scan orders' } },
  { id: 'filter', type: 'step', position: { x: -110, y: 110 }, data: { label: 'Filter: paid' } },
  { id: 'join', type: 'step', position: { x: 110, y: 110 }, data: { label: 'Join customers' } },
  { id: 'sort', type: 'step', position: { x: 0, y: 220 }, data: { label: 'Sort by total' } },
];

const initialEdges: Edge[] = [
  { id: 'scan-filter', source: 'scan', target: 'filter', markerEnd: 'arrowclosed' },
  { id: 'scan-join', source: 'scan', target: 'join', markerEnd: 'arrowclosed', animated: true },
  { id: 'filter-sort', source: 'filter', target: 'sort', markerEnd: 'arrowclosed' },
];

function Editor() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <FlowingerCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={(connection) => setEdges((current) => addEdge({ ...connection, markerEnd: 'arrowclosed' }, current))}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.25 }}
    >
      <Background />
      <Controls position="bottom-left" />
      <MiniMap position="bottom-right" />
    </FlowingerCanvas>
  );
}

export function LiveEditor() {
  return (
    <div className="flowinger-live not-content">
      <FlowingerProvider>
        <Editor />
      </FlowingerProvider>
    </div>
  );
}
