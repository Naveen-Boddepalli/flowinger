import { useCallback, useEffect, useState } from 'react';
import { applyEdgeChanges, applyNodeChanges } from './changes.ts';
import { warnAboutReactFlowDefaults } from './devWarnings.ts';
import { FlowingerCore } from './FlowingerCore.tsx';
import { allFeatures } from './features/index.ts';
import type { Edge, EdgeChange, FlowingerProps, Node, NodeChange } from './types.ts';

const NO_NODES: Node[] = [];
const NO_EDGES: Edge[] = [];

/**
 * The whole canvas — every feature, and what a React Flow app expects of `<ReactFlow>`. An app that
 * needs less imports {@link FlowingerCore} and names the features it does need, and pays only for those.
 *
 * It is also what lets the canvas own the graph. With no `nodes` (or `edges`) prop it holds the list
 * itself, starting from `defaultNodes`, and applies its own changes to it — the same path a controlled
 * flow's caller takes, so there is one way things happen. `FlowingerCore` is always controlled: it shows
 * the `nodes` it is given and reports changes.
 */
export function FlowingerCanvas(props: FlowingerProps) {
  const { nodes, edges, defaultNodes, defaultEdges, onNodesChange, onEdgesChange } = props;
  const ownsNodes = nodes === undefined;
  const ownsEdges = edges === undefined;
  const [ownNodes, setOwnNodes] = useState<Node[]>(() => defaultNodes ?? NO_NODES);
  const [ownEdges, setOwnEdges] = useState<Edge[]>(() => defaultEdges ?? NO_EDGES);
  const changeNodes = useCallback(
    (changes: NodeChange[]) => {
      if (ownsNodes) setOwnNodes((current) => applyNodeChanges(changes, current));
      onNodesChange?.(changes);
    },
    [ownsNodes, onNodesChange],
  );
  const changeEdges = useCallback(
    (changes: EdgeChange[]) => {
      if (ownsEdges) setOwnEdges((current) => applyEdgeChanges(changes, current));
      onEdgesChange?.(changes);
    },
    [ownsEdges, onEdgesChange],
  );
  return (
    <FlowingerCore
      {...props}
      nodes={nodes ?? ownNodes}
      edges={edges ?? ownEdges}
      // Someone is listening — so the flow is controlled — when it owns the list or is told of changes.
      onNodesChange={ownsNodes || onNodesChange ? changeNodes : undefined}
      onEdgesChange={ownsEdges || onEdgesChange ? changeEdges : undefined}
      features={props.features ? [...allFeatures, ...props.features] : allFeatures}
    />
  );
}

/**
 * `<FlowingerCanvas>` under React Flow's name — with flowinger's defaults until 1.0. From 1.0 it takes React
 * Flow's (`reactFlowDefaults`), so code moving from React Flow keeps its behaviour, and `<FlowingerCanvas>`
 * keeps flowinger's. Until then, in development, it says once a page which of those props it leaves out.
 */
export function ReactFlow(props: FlowingerProps) {
  // What a canvas is given when it mounts is what it is judged by, as for the other warnings.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') warnAboutReactFlowDefaults(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <FlowingerCanvas {...props} />;
}
