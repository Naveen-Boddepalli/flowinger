// The landing page's hero picture, drawn by Flowinger itself: what you give it (your data, as nodes and edges),
// the canvas, and what it does with them. It renders on the server, and the entrance (nodes popping in, edges
// drawing themselves, then dots flowing along them) is CSS, so it plays before React loads. Once hydrated,
// a mouse can drag the nodes and hovering one lights its edges. It is a picture, not a control: hidden from
// assistive tech, no tab stops, no pan or zoom, and a finger on it scrolls the page.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  Position,
  getBezierPath,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from 'flowinger';
import './HeroGraph.css';

type Kind = 'source' | 'data' | 'core' | 'feature';
type HeroData = { label: string; kind: Kind; step: number };

const node = (id: string, x: number, y: number, label: string, kind: Kind, step: number, width: number): Node => ({
  id,
  type: 'hero',
  position: { x, y },
  width,
  height: kind === 'core' ? 48 : kind === 'feature' ? 34 : 40,
  data: { label, kind, step } satisfies HeroData,
});

// Positions are centres (nodeOrigin [0.5, 0.5]); `step` orders the entrance, top to bottom.
const initialNodes: Node[] = [
  node('data', 0, 0, 'Your data', 'source', 0, 128),
  node('nodes', -96, 92, 'nodes[]', 'data', 1, 104),
  node('edges', 96, 92, 'edges[]', 'data', 1, 104),
  node('canvas', 0, 192, '<FlowingerCanvas />', 'core', 2, 212),
  node('drag', -168, 296, 'Drag', 'feature', 3, 84),
  node('connect', -56, 296, 'Connect', 'feature', 3.2, 96),
  node('undo', 56, 296, 'Undo', 'feature', 3.4, 84),
  node('export', 168, 296, 'Export', 'feature', 3.6, 92),
];

const edge = (source: string, target: string, step: number): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  type: 'flow',
  data: { step },
});

const initialEdges: Edge[] = [
  edge('data', 'nodes', 0.5),
  edge('data', 'edges', 0.5),
  edge('nodes', 'canvas', 1.5),
  edge('edges', 'canvas', 1.5),
  edge('canvas', 'drag', 2.5),
  edge('canvas', 'connect', 2.7),
  edge('canvas', 'undo', 2.9),
  edge('canvas', 'export', 3.1),
];

function HeroNode({ data }: NodeProps) {
  const { label, kind, step } = data as HeroData;
  return (
    <div className={`fl-hero-node is-${kind}`} style={{ '--fl-step': step } as CSSProperties}>
      {kind !== 'source' && <Handle type="target" position={Position.Top} isConnectable={false} />}
      {label}
      {kind !== 'feature' && <Handle type="source" position={Position.Bottom} isConnectable={false} />}
    </div>
  );
}

/** A path that draws itself in (its length normalised to 1), and a second one carrying dots along it. */
function FlowEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <g style={{ '--fl-step': Number(data?.step ?? 0) } as CSSProperties}>
      <path className="fl-hero-edge-base" d={path} pathLength={1} />
      <path className="fl-hero-edge-flow" d={path} />
    </g>
  );
}

/** The box the initial nodes span, plus a little room: what `fitView` frames, so a dragged node stays in view. */
const NODE_EXTENT: [[number, number], [number, number]] = [
  [-226, -24],
  [226, 320],
];

const nodeTypes = { hero: HeroNode };
const edgeTypes = { flow: FlowEdge };

function Graph() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [hovered, setHovered] = useState<string | null>(null);
  // Dragging is for a mouse: on a touch screen a drag would fight the page's scroll. Off on the server.
  const [canDrag, setCanDrag] = useState(false);
  const [dragged, setDragged] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanDrag(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const edges = useMemo(
    () =>
      initialEdges.map((e) =>
        hovered && (e.source === hovered || e.target === hovered) ? { ...e, className: 'is-lit' } : e,
      ),
    [hovered],
  );

  return (
    <>
      <FlowingerCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        nodeOrigin={[0.5, 0.5]}
        nodesDraggable={canDrag}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        onNodeMouseEnter={(_, n) => setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeDragStart={() => setDragged(true)}
        // A dragged node stays inside the framed area, and the view holds still.
        nodeExtent={NODE_EXTENT}
        autoPanOnNodeDrag={false}
        fitView
        fitViewOptions={{ padding: '6%', maxZoom: 1.15 }}
        // The canvas takes every touch by default; here the page keeps them, so a finger scrolls past.
        style={{ touchAction: 'auto' }}
      />
      {canDrag && (
        <span className={dragged ? 'fl-hero-hint is-done' : 'fl-hero-hint'} aria-hidden="true">
          Go on, drag a node
        </span>
      )}
    </>
  );
}

export function HeroGraph() {
  return (
    <div className="fl-hero-graph not-content" aria-hidden="true">
      <FlowingerProvider>
        <Graph />
      </FlowingerProvider>
    </div>
  );
}
