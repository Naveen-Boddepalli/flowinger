import { useCallback, useRef, type ChangeEvent } from 'react';
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
import { useUndoRedo } from 'flowinger/history';
import { useClipboard } from 'flowinger/clipboard';
import { useSnapLines, SnapLinesOverlay } from 'flowinger/snaplines';
import { exportCanvasToSvg, downloadFile } from 'flowinger/export';
import { shapeNodeTypes } from 'flowinger/shapes';
import { SmartEdge } from 'flowinger/smart-edges';

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
const nodeTypes = {
  task: TaskNode,
  ...shapeNodeTypes,
};
const edgeTypes = {
  removable: RemovableEdge,
  smart: SmartEdge,
};

const initialNodes: Node[] = [
  { id: '1', type: 'task', position: { x: 0, y: 60 }, width: 180, height: 44, data: { title: 'Draft the plan' } },
  { id: '2', type: 'diamond', position: { x: 260, y: 45 }, width: 120, height: 80, data: { label: 'Approved?' } },
  { id: '3', type: 'task', position: { x: 440, y: 0 }, width: 180, height: 44, data: { title: 'Implement feature' } },
  { id: '4', type: 'cylinder', position: { x: 460, y: 120 }, width: 100, height: 90, data: { label: 'Store in DB' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'removable', markerEnd: 'arrowclosed' },
  { id: 'e2-3', source: '2', target: '3', type: 'smart', markerEnd: 'arrowclosed' },
  { id: 'e2-4', source: '2', target: '4', type: 'smart', markerEnd: 'arrowclosed' },
];

let counter = 4;

function Editor() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { addNodes, screenToFlowPosition } = useReactFlow();

  const { undo, redo, canUndo, canRedo, takeSnapshot } = useUndoRedo({ enableShortcuts: true });
  const { copy, paste, canPaste } = useClipboard({ enableShortcuts: true });
  const { snapLines, handleNodeDrag, clearSnapLines } = useSnapLines({ threshold: 6 });

  const onConnect = useCallback(
    (connection: Connection) => {
      takeSnapshot();
      setEdges((current) => addEdge({ ...connection, type: 'smart', markerEnd: 'arrowclosed' }, current));
    },
    [setEdges, takeSnapshot],
  );

  const addTask = () => {
    takeSnapshot();
    counter += 1;
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

  const handleExportSvg = async () => {
    if (!wrapperRef.current) return;
    const svg = await exportCanvasToSvg(wrapperRef.current, { backgroundColor: '#0f172a' });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    downloadFile(url, 'diagram.svg');
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    takeSnapshot();
    setNodes(initialNodes);
    setEdges(initialEdges);
  };

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
      <FlowingerCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={(_e, node) => {
          handleNodeDrag(node, nodes, node.position);
        }}
        onNodeDragStop={() => {
          clearSnapLines();
          takeSnapshot();
        }}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        snapToGrid
        snapGrid={[15, 15]}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        minZoom={0.3}
      >
        <Background />
        <SnapLinesOverlay snapLines={snapLines} color="#60a5fa" />
        <Panel position="top-left">
          <div className="toolbar">
            <button onClick={addTask}>Add task</button>
            <button onClick={() => undo()} disabled={!canUndo} title="Undo (Cmd+Z)">Undo</button>
            <button onClick={() => redo()} disabled={!canRedo} title="Redo (Cmd+Y)">Redo</button>
            <button onClick={() => void copy()} title="Copy selected (Cmd+C)">Copy</button>
            <button onClick={() => void paste()} disabled={!canPaste} title="Paste (Cmd+V)">Paste</button>
            <button onClick={() => void handleExportSvg()} title="Export SVG">Export SVG</button>
            <button onClick={reset}>Reset</button>
          </div>
        </Panel>
        <MiniMap position="bottom-left" />
      </FlowingerCanvas>
    </div>
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
