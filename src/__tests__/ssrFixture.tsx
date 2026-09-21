// Shared by ssr.test.tsx (a server: no DOM) and hydration.test.tsx (a client).
import {
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  Position,
  useStore,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from '../index.ts';

function PortNode({ data }: NodeProps) {
  return (
    <div>
      <Handle id="in" type="target" position={Position.Top} />
      <span>{String(data.label)}</span>
      <Handle id="out" type="source" position={Position.Bottom} />
    </div>
  );
}

function Probe() {
  const panZoom = useStore((s) => s.panZoom);
  const viewport = useViewport();
  return <output>{`${panZoom === null ? 'unmounted' : 'mounted'} ${String(viewport.zoom)}`}</output>;
}

const nodes: Node[] = [
  { id: 'a', type: 'port', position: { x: 10, y: 20 }, width: 100, height: 40, data: { label: 'alpha' } },
  { id: 'b', type: 'port', position: { x: 10, y: 220 }, width: 100, height: 40, data: { label: 'beta' }, selected: true },
];
const edges: Edge[] = [
  {
    id: 'e',
    source: 'a',
    target: 'b',
    sourceHandle: 'out',
    targetHandle: 'in',
    label: 'joins',
    markerEnd: 'arrowclosed',
  },
];

const noChanges = () => {};

export const tree = (
  <FlowingerProvider initialViewport={{ x: 5, y: 6, zoom: 2 }}>
    <FlowingerCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={{ port: PortNode }}
      keyboardNavigation
      // Controlled, so `selected` on a node is what the server draws.
      elementsSelectable
      onNodesChange={noChanges}
    >
      <Probe />
    </FlowingerCanvas>
    <Controls />
    <MiniMap />
  </FlowingerProvider>
);
