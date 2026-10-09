// React Flow's names for types flowinger already has — so `import type { OnNodesChange } from '@xyflow/react'`
// becomes a change of package name and nothing else. These were most of what the audit listed as missing
// (`node scripts/audit-react-flow.mjs`): 103 of 112 exports, and a missing one is the first compile error
// in a migration.
//
// Types only: nothing here exists at runtime, so nothing reaches a bundle.
//
// Left out on purpose:
//   - names for something flowinger does not have (`NodeOrigin`, `ColorMode`, `PanOnScrollMode`, the
//     resize-control and MiniMap-node types): an alias to nothing would compile and mean nothing;
//   - names whose *shape* differs (`FinalConnectionState` — flowinger's `onConnectEnd` is given a
//     `ConnectEndState`): the error at the call site is the honest answer;
//   - generics flowinger does not have. `ReactFlowProps` and `ReactFlowInstance` take no node/edge type
//     arguments here, because the canvas and the instance are not generic; `ReactFlowInstance<MyNode>` is
//     an error rather than a type that quietly ignores `MyNode`.
//
// Each handler is written out against the prop it describes, and `reactFlowNames.test.ts` asserts that it
// is *exactly* that prop's type — so these cannot drift from what the canvas accepts.
import type { ComponentProps, ComponentType } from 'react';
import type { BezierEdge, SmoothStepEdge, StepEdge, StraightEdge } from './builtinEdges.tsx';
import type { ControlsProps } from './Controls.tsx';
import type { UseNodeConnectionsOptions } from './dataHooks.ts';
import type {
  Connection,
  ConnectEndState,
  ConnectStartParams,
  ConnectionLineProps,
  Edge,
  EdgeChange,
  FlowingerInstance,
  FlowingerProps,
  Node,
  NodeChange,
  TranslateExtent,
  Viewport,
  XYPosition,
} from './types.ts';

// --- the canvas and the instance ------------------------------------------------------------------------

/** The canvas's props. Not generic: `FlowingerProps` takes no node or edge type. */
export type ReactFlowProps = FlowingerProps;
/** What `useReactFlow()` returns. Not generic. */
export type ReactFlowInstance = FlowingerInstance;
/** What `instance.toObject()` returns. */
export type ReactFlowJsonObject<N extends Node = Node, E extends Edge = Edge> = {
  nodes: N[];
  edges: E[];
  viewport: Viewport;
};
/** `defaultEdgeOptions`: defaults for every edge; an edge's own fields win. */
export type DefaultEdgeOptions = NonNullable<FlowingerProps['defaultEdgeOptions']>;

// --- callbacks ------------------------------------------------------------------------------------------

export type OnNodesChange<N extends Node = Node> = (changes: NodeChange<N>[]) => void;
export type OnEdgesChange<E extends Edge = Edge> = (changes: EdgeChange<E>[]) => void;

export type OnConnect = (connection: Connection) => void;
/** Which handle a drag began at — narrower than React Flow's (no `null` node or handle type). */
export type OnConnectStartParams = ConnectStartParams;
export type OnConnectStart = (event: PointerEvent, params: OnConnectStartParams) => void;
/** Its second argument is flowinger's `ConnectEndState` — `{ connection, isValid }`. */
export type OnConnectEnd = (event: PointerEvent, state: ConnectEndState) => void;
export type IsValidConnection = (connection: Connection) => boolean;
export type OnReconnect<E extends Edge = Edge> = (oldEdge: E, newConnection: Connection) => void;

export type OnInit = (instance: FlowingerInstance) => void;
export type OnMove = (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void;
export type OnMoveStart = OnMove;
export type OnMoveEnd = OnMove;

export type OnNodeDrag<N extends Node = Node> = (event: React.PointerEvent, node: N, nodes: N[]) => void;
export type NodeMouseHandler<N extends Node = Node> = (event: React.MouseEvent, node: N) => void;
export type EdgeMouseHandler<E extends Edge = Edge> = (event: React.MouseEvent, edge: E) => void;

export type OnNodesDelete<N extends Node = Node> = (nodes: N[]) => void;
export type OnEdgesDelete<E extends Edge = Edge> = (edges: E[]) => void;
export type OnDelete<N extends Node = Node, E extends Edge = Edge> = (elements: { nodes: N[]; edges: E[] }) => void;
/** May return `false`, a smaller set, or a promise of either — a superset of what React Flow's allows. */
export type OnBeforeDelete<N extends Node = Node, E extends Edge = Edge> = (elements: {
  nodes: N[];
  edges: E[];
}) => boolean | { nodes: N[]; edges: E[] } | Promise<boolean | { nodes: N[]; edges: E[] }>;

export type OnSelectionChangeParams<N extends Node = Node, E extends Edge = Edge> = { nodes: N[]; edges: E[] };
export type OnSelectionChangeFunc<N extends Node = Node, E extends Edge = Edge> = (
  params: OnSelectionChangeParams<N, E>,
) => void;

// --- geometry -------------------------------------------------------------------------------------------

export type CoordinateExtent = TranslateExtent;
export type SnapGrid = [number, number];
export type KeyCode = string | string[];
export type Dimensions = { width: number; height: number };
export type Box = XYPosition & { x2: number; y2: number };
export type Transform = [number, number, number];
export type XYZPosition = XYPosition & { z: number };

// --- instance methods, as types -------------------------------------------------------------------------

export type SetViewport = FlowingerInstance['setViewport'];
export type SetCenter = FlowingerInstance['setCenter'];
export type FitBounds = FlowingerInstance['fitBounds'];
export type FitView = FlowingerInstance['fitView'];

// --- components and paths -------------------------------------------------------------------------------

export type ConnectionLineComponentProps = ConnectionLineProps;
export type ConnectionLineComponent = ComponentType<ConnectionLineComponentProps>;
export type ControlProps = ControlsProps;
export type UseNodeConnectionsParams = UseNodeConnectionsOptions;

export type BezierEdgeProps = ComponentProps<typeof BezierEdge>;
export type StraightEdgeProps = ComponentProps<typeof StraightEdge>;
export type SmoothStepEdgeProps = ComponentProps<typeof SmoothStepEdge>;
export type StepEdgeProps = ComponentProps<typeof StepEdge>;
