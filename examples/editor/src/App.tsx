import { useCallback, type ChangeEvent } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  Panel,
  Position,
  addEdge,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from 'flowinger';

/** A node of your own: a React component. Anything inside it that takes a press — an input, a button —
 *  gets the `nodrag` class, so using it does not drag the node. */
function TaskNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const onTitle = (event: ChangeEvent<HTMLInputElement>) => updateNodeData(id, { title: event.target.value });
  return (
    <div className={`task${selected ? ' task-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <input className="nodrag" value={String(data.title)} onChange={onTitle} aria-label="Task title" />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** An edge of your own: the default drawing (`BaseEdge`) plus a button halfway along it. */
function RemovableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button
          className="nopan edge-remove"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          onClick={() => setEdges((edges) => edges.filter((edge) => edge.id !== id))}
          aria-label="Remove connection"
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

// Defined outside the component so they keep their identity between renders.
const nodeTypes = { task: TaskNode };
const edgeTypes = { removable: RemovableEdge };

const initialNodes: Node[] = [
  { id: '1', type: 'task', position: { x: 0, y: 60 }, width: 180, height: 44, data: { title: 'Draft the plan' } },
  { id: '2', type: 'task', position: { x: 280, y: 0 }, width: 180, height: 44, data: { title: 'Review it' } },
  { id: '3', type: 'task', position: { x: 280, y: 120 }, width: 180, height: 44, data: { title: 'Estimate the work' } },
  { id: '4', type: 'task', position: { x: 560, y: 60 }, width: 180, height: 44, data: { title: 'Ship it' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'removable', markerEnd: 'arrowclosed' },
  { id: 'e1-3', source: '1', target: '3', type: 'removable', markerEnd: 'arrowclosed' },
  { id: 'e2-4', source: '2', target: '4', type: 'removable', markerEnd: 'arrowclosed' },
];

let counter = 4;

function Editor() {
  // Controlled: the canvas reports what happened (a drag, a selection, a removal) and these apply it.
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { addNodes, screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) => addEdge({ ...connection, type: 'removable', markerEnd: 'arrowclosed' }, current)),
    [setEdges],
  );

  const addTask = () => {
    counter += 1;
    // Where the middle of the visible canvas is, in graph units.
    const at = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    addNodes({
      id: String(counter),
      type: 'task',
      position: { x: at.x - 90, y: at.y - 22 },
      width: 180,
      height: 44,
      data: { title: `Task ${String(counter)}` },
    });
  };

  const reset = () => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  };

  return (
    <FlowingerCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      snapToGrid
      snapGrid={[20, 20]}
      deleteKeyCode={['Backspace', 'Delete']}
      fitView
      minZoom={0.3}
    >
      <Background />
      <Panel position="top-left">
        <div className="toolbar">
          <button onClick={addTask}>Add task</button>
          <button onClick={reset}>Reset</button>
          <span>Drag a handle to connect · Backspace deletes the selection</span>
        </div>
      </Panel>
      <MiniMap position="bottom-left" />
    </FlowingerCanvas>
  );
}

export function App() {
  return (
    <div className="app">
      <FlowingerProvider>
        <Editor />
        <Controls position="bottom-right" />
      </FlowingerProvider>
    </div>
  );
}
