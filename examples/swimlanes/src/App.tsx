import { useCallback, useState } from 'react';
import {
  Background,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  Panel,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from 'flowinger';

// --- the layout -----------------------------------------------------------------------------------------

const LANE_WIDTH = 1130;
const LANE_HEIGHT = 140;
const LABEL_WIDTH = 120;
const STEP_WIDTH = 150;
const STEP_HEIGHT = 44;

const lanes = ['Customer', 'Sales', 'Warehouse', 'Billing'];
const laneId = (name: string) => `lane-${name.toLowerCase()}`;

/** A lane is an ordinary node with children: the steps in it. It is not draggable or selectable. */
function LaneNode({ data }: NodeProps) {
  return (
    <div className={`lane${data.hovered === true ? ' lane-hovered' : ''}`}>
      <div className="lane-label">{String(data.label)}</div>
    </div>
  );
}

/** A step in the process. Its `position` is relative to its lane — the parent it names in `parentId`. */
function StepNode({ data, selected }: NodeProps) {
  return (
    <div className={`step${selected ? ' step-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      {String(data.label)}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { lane: LaneNode, step: StepNode };

const laneNodes: Node[] = lanes.map((name, i) => ({
  id: laneId(name),
  type: 'lane',
  position: { x: 0, y: i * LANE_HEIGHT },
  width: LANE_WIDTH,
  height: LANE_HEIGHT,
  data: { label: name },
  draggable: false,
  selectable: false,
  // Lanes stay under everything drawn on them.
  zIndex: -1,
}));

/** A step in a lane, `column` steps from the label — its position is the lane's, plus where it sits in it. */
const step = (id: string, lane: string, column: number, label: string): Node => ({
  id,
  type: 'step',
  parentId: laneId(lane),
  position: { x: LABEL_WIDTH + 30 + column * 200, y: (LANE_HEIGHT - STEP_HEIGHT) / 2 },
  width: STEP_WIDTH,
  height: STEP_HEIGHT,
  data: { label },
});

// Parents come before their children in the list.
const initialNodes: Node[] = [
  ...laneNodes,
  step('order', 'Customer', 0, 'Place order'),
  step('check', 'Sales', 1, 'Check stock'),
  step('pick', 'Warehouse', 2, 'Pick and pack'),
  step('invoice', 'Billing', 2, 'Send invoice'),
  step('ship', 'Warehouse', 3, 'Ship'),
  step('receive', 'Customer', 4, 'Receive'),
];

const flow = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  type: 'smoothstep',
  markerEnd: 'arrowclosed',
});
const initialEdges: Edge[] = [
  flow('order', 'check'),
  flow('check', 'pick'),
  flow('check', 'invoice'),
  flow('pick', 'ship'),
  flow('ship', 'receive'),
];

// --- moving a step between lanes --------------------------------------------------------------------------

const isLane = (n: Node) => n.type === 'lane';

/** Where a node is on the canvas: its own position plus its parent's (lanes sit at the top level). */
function absoluteOf(node: Node, nodes: readonly Node[]) {
  const parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : undefined;
  return parent ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y } : node.position;
}

/** The lane under a step's centre, if any. */
function laneAt(step: Node, nodes: readonly Node[]): Node | undefined {
  const at = absoluteOf(step, nodes);
  const cx = at.x + STEP_WIDTH / 2;
  const cy = at.y + STEP_HEIGHT / 2;
  return nodes.find(
    (n) => isLane(n) && cx >= n.position.x && cx <= n.position.x + LANE_WIDTH && cy >= n.position.y && cy <= n.position.y + LANE_HEIGHT,
  );
}

/** Keeps a step inside its lane's box, clear of the label: a position relative to the lane. */
function clampInLane(x: number, y: number) {
  return {
    x: Math.min(Math.max(x, LABEL_WIDTH + 8), LANE_WIDTH - STEP_WIDTH - 8),
    y: Math.min(Math.max(y, 8), LANE_HEIGHT - STEP_HEIGHT - 8),
  };
}

let counter = 0;

function Swimlanes() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [hovered, setHovered] = useState<string | null>(null);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((current) => addEdge({ ...connection, type: 'smoothstep', markerEnd: 'arrowclosed' }, current)),
    [setEdges],
  );

  // While a step is dragged, light up the lane it would land in.
  const onNodeDrag = (_: unknown, node: Node) => {
    if (isLane(node)) return;
    setHovered(laneAt(node, nodes)?.id ?? null);
  };

  /**
   * Dropped: the step belongs to the lane under its centre. A new parent means a new origin, so the position
   * is turned from "relative to the old lane" into "relative to the new one" — the step stays where it was
   * dropped on the canvas. Dropped outside every lane, it goes back into the nearest one's box.
   */
  const onNodeDragStop = (_: unknown, node: Node) => {
    setHovered(null);
    if (isLane(node)) return;
    setNodes((current) => {
      const found = current.find((n) => n.id === node.id);
      if (!found) return current;
      // Where the drag left it, which the callback is given.
      const moved = { ...found, position: node.position };
      const at = absoluteOf(moved, current);
      const target = laneAt(moved, current) ?? nearestLane(at.y + STEP_HEIGHT / 2, current);
      const position = clampInLane(at.x - target.position.x, at.y - target.position.y);
      return current.map((n) => (n.id === node.id ? { ...n, parentId: target.id, position } : n));
    });
  };

  const addStep = () => {
    counter += 1;
    setNodes((current) => [...current, step(`new-${String(counter)}`, 'Sales', 0, `New step ${String(counter)}`)]);
  };

  // The hovered lane is drawn from state, not stored in the nodes: it is a moment, not part of the process.
  const shown = hovered ? nodes.map((n) => (n.id === hovered ? { ...n, data: { ...n.data, hovered: true } } : n)) : nodes;

  return (
    <FlowingerCanvas
      nodes={shown}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      deleteKeyCode={['Backspace', 'Delete']}
      fitView
      fitViewOptions={{ padding: 0.14 }}
    >
      <Background />
      <Panel position="bottom-right">
        <div className="toolbar">
          <span>Drag a step into another lane.</span>
          <button onClick={addStep}>Add step</button>
        </div>
      </Panel>
      <Controls position="bottom-left" />
    </FlowingerCanvas>
  );
}

function nearestLane(y: number, nodes: readonly Node[]): Node {
  const all = nodes.filter(isLane);
  return all.reduce((best, n) =>
    Math.abs(n.position.y + LANE_HEIGHT / 2 - y) < Math.abs(best.position.y + LANE_HEIGHT / 2 - y) ? n : best,
  );
}

export function App() {
  return (
    <div className="app">
      <FlowingerProvider>
        <Swimlanes />
      </FlowingerProvider>
    </div>
  );
}
