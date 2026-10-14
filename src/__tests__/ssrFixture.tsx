// Shared by ssr.test.tsx (a server: no DOM) and hydration.test.tsx (a client).
import {
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  NodeResizer,
  NodeToolbar,
  Position,
  getStraightPath,
  useStore,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '../index.ts';

function PortNode({ data }: NodeProps) {
  return (
    <div>
      <NodeResizer />
      <NodeToolbar isVisible>
        <button type="button">tools</button>
      </NodeToolbar>
      <Handle id="in" type="target" position={Position.Top} />
      <span>{String(data.label)}</span>
      <Handle id="out" type="source" position={Position.Bottom} />
    </div>
  );
}

/** A custom edge whose label is HTML, drawn into a layer that only exists in a browser. */
function LabelledEdge(props: EdgeProps) {
  const [path, x, y] = getStraightPath(props);
  return (
    <>
      <BaseEdge path={path} />
      <EdgeLabelRenderer>
        <span className="html-label" style={{ position: 'absolute', transform: `translate(${String(x)}px, ${String(y)}px)` }}>
          HTML-LABEL
        </span>
      </EdgeLabelRenderer>
    </>
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
    animated: true,
  },
  { id: 'e2', source: 'a', target: 'b', type: 'labelled' },
];

const noChanges = () => {};

export const tree = (
  <FlowingerProvider initialViewport={{ x: 5, y: 6, zoom: 2 }}>
    <FlowingerCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={{ port: PortNode }}
      edgeTypes={{ labelled: LabelledEdge }}
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

/**
 * The view given by the canvas, not the provider — as a page does that lays the graph out on the server and
 * frames it there (`examples/nextjs`): `defaultViewport`, and a controlled `viewport`.
 */
export const framedByCanvas = (
  <FlowingerProvider>
    <FlowingerCanvas nodes={nodes} edges={[]} nodeTypes={{ port: PortNode }} defaultViewport={{ x: 30, y: 40, zoom: 1.5 }} />
  </FlowingerProvider>
);
export const heldByCanvas = (
  <FlowingerProvider>
    <FlowingerCanvas nodes={nodes} edges={[]} nodeTypes={{ port: PortNode }} viewport={{ x: -7, y: 8, zoom: 0.5 }} />
  </FlowingerProvider>
);
