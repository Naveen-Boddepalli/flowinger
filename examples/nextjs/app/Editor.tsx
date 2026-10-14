'use client';

import { useCallback } from 'react';
import {
  Background,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  MiniMap,
  Panel,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type Viewport,
} from 'flowinger';
import { useUndoRedo } from 'flowinger/history';
import { nodeTypes } from './StepNode';

type Props = { initialNodes: Node[]; initialEdges: Edge[]; viewport: Viewport };

function Canvas({ initialNodes, initialEdges, viewport }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { undo, redo, canUndo, canRedo, takeSnapshot } = useUndoRedo({ enableShortcuts: true });

  const onConnect = useCallback(
    (connection: Connection) => {
      takeSnapshot();
      setEdges((current) => addEdge({ ...connection, markerEnd: 'arrowclosed' }, current));
    },
    [setEdges, takeSnapshot],
  );

  const reset = () => {
    takeSnapshot();
    setNodes(initialNodes);
    setEdges(initialEdges);
  };

  return (
    <FlowingerCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStart={() => takeSnapshot()}
      onBeforeDelete={(elements) => {
        takeSnapshot();
        return elements;
      }}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      deleteKeyCode={['Backspace', 'Delete']}
      defaultViewport={viewport}
      fitView
    >
      <Background />
      <Panel position="top-left">
        <div className="toolbar">
          <button onClick={() => undo()} disabled={!canUndo}>Undo</button>
          <button onClick={() => redo()} disabled={!canRedo}>Redo</button>
          <button onClick={reset}>Reset</button>
        </div>
      </Panel>
      <MiniMap position="bottom-left" />
    </FlowingerCanvas>
  );
}

/** The same graph as an editor: drag, connect, select, delete, undo. It starts from the server's HTML too. */
export function Editor(props: Props) {
  return (
    <FlowingerProvider>
      <Canvas {...props} />
      <Controls position="bottom-right" />
    </FlowingerProvider>
  );
}
