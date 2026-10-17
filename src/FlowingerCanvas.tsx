import { useCallback, useState } from 'react';
import { applyEdgeChanges, applyNodeChanges, type EdgeChangeset, type NodeChangeset } from './changes.ts';
import { ViewDefaultsContext } from './context.ts';
import { FlowingerCore } from './FlowingerCore.tsx';
import { allFeatures } from './features/index.ts';
import { REACT_FLOW_MARGIN, reactFlowDefaults } from './reactFlowDefaults.ts';
import type { ViewDefaults } from './store.ts';
import type { Edge, FlowingerProps, Node } from './types.ts';

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
    (changes: NodeChangeset) => {
      if (ownsNodes) setOwnNodes((current) => applyNodeChanges(changes, current));
      onNodesChange?.(changes);
    },
    [ownsNodes, onNodesChange],
  );
  const changeEdges = useCallback(
    (changes: EdgeChangeset) => {
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

/** React Flow's defaults for what is not a prop: a fit's margin, an animated move's path, `Controls`' lock. */
const REACT_FLOW_VIEW: ViewDefaults = { fitViewPadding: REACT_FLOW_MARGIN, interpolate: 'smooth', showInteractive: true };

/**
 * `<FlowingerCanvas>` under React Flow's name, with React Flow's defaults: `reactFlowDefaults` under the props it is
 * given, and React Flow's fit margin, animated-move path and `Controls` lock. So code moving from React Flow keeps
 * its behaviour by changing an import, and `<FlowingerCanvas>` keeps flowinger's (interaction off until asked for).
 */
export function ReactFlow(props: FlowingerProps) {
  return (
    <ViewDefaultsContext.Provider value={REACT_FLOW_VIEW}>
      <FlowingerCanvas {...withReactFlowDefaults(props)} />
    </ViewDefaultsContext.Provider>
  );
}

/**
 * `reactFlowDefaults` under `props`. A prop given as `undefined` takes the default, as React Flow's do. The fit's
 * margin is not taken from there but from the view defaults above, which every fit that names none uses — so
 * `fitViewOptions` is only ever the caller's.
 */
function withReactFlowDefaults(props: FlowingerProps): FlowingerProps {
  const out: Record<string, unknown> = { ...reactFlowDefaults, fitViewOptions: undefined };
  for (const [name, value] of Object.entries(props)) if (value !== undefined) out[name] = value;
  return out as FlowingerProps;
}
