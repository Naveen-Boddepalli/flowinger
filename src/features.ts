import type {
  ComponentType,
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  SVGAttributes,
} from 'react';
import type { FlowingerEdgesProps } from './FlowingerEdges.tsx';
import type { Size } from './geometry.ts';
import type {
  ConnectionState,
  EngineOptions,
  FlowingerStore,
  HandleRecord,
  NodeCallbacks,
  VisibleSet,
} from './store.ts';
import type {
  Edge,
  EdgeChange,
  FlowingerProps,
  HandleType,
  Node,
  NodeChange,
  Rect,
  Viewport,
  XYPosition,
} from './types.ts';

/**
 * Something the canvas can do beyond showing a graph and panning it: dragging nodes, drawing a
 * selection box, connecting handles, and so on. A canvas has only the features it is given, so an app
 * that needs none of them does not carry their code — `<FlowingerCore features={[dragFeature]}>` — while
 * `<FlowingerCanvas>` (and its alias `ReactFlow`) has them all.
 *
 * A feature has two halves, both optional. The *engine* half (`install`) adds to the store: it is
 * handed an {@link EngineContext} — the store's internals — and returns the methods it contributes.
 * The *React* half is a few slots the canvas, its nodes and its edges call or render.
 *
 * Every hook here is called on every render of what hosts it, in the order the features were given, so
 * the list of features must not change over a canvas's life (it is read once).
 */
export interface Feature<Api = unknown> {
  /** Identifies it: a feature is installed once, however many times it is named. */
  readonly name: string;
  /** Features this one builds on; they are installed first. */
  readonly needs?: readonly Feature[];
  /** Adds this feature's methods to the store, and returns them (see `FlowingerStore.api`). */
  readonly install?: (ctx: EngineContext) => Api;
  /** Called by the canvas: gestures on the pane, keys, and how the container looks. */
  readonly useCanvas?: (args: CanvasArgs) => CanvasBits | undefined;
  /** Called by every node: what pressing, clicking and typing on it does. */
  readonly useNode?: (args: NodeArgs) => NodeBits | undefined;
  /** Called by every edge: what clicking and typing on it does. */
  readonly useEdge?: (args: EdgeArgs) => EdgeBits | undefined;
  /** Drawn inside the canvas, above the graph — a selection box. */
  readonly Layer?: ComponentType;
  /** Drawn inside the topmost edge layer, in graph space — the line being dragged out of a handle. */
  readonly EdgesLayer?: ComponentType<FlowingerEdgesProps>;
  /** Drawn with each edge — the grips on the ends of a selected one. */
  readonly EdgeAdornment?: ComponentType<EdgeAdornmentProps>;
}

/** Things the store tells a feature about, besides the calls made on it. */
export type FeatureEvent =
  /** The viewport, the layout, the nodes, the edges or the options changed. */
  | 'change'
  /** The canvas went away. */
  | 'detach';

/**
 * The store's internals, as a feature sees them. What is here is read as of *now*: `ctx.nodes` is
 * whatever the canvas last handed over, not what it was when the feature was installed.
 */
export interface EngineContext {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
  readonly nodeById: ReadonlyMap<string, Node>;
  readonly edgeById: ReadonlyMap<string, Edge>;
  /** The ids of each parent's children. */
  readonly childrenOf: ReadonlyMap<string, readonly string[]>;
  readonly options: EngineOptions;
  readonly callbacks: NodeCallbacks;
  readonly viewport: Viewport;
  /** The pane; null before a canvas has attached. */
  readonly container: HTMLElement | null;
  /** The size each node was last measured at, as the caller has been told. Writable: see `resize`. */
  readonly reported: Map<string, Size>;
  /** Nodes being dragged right now — never culled, or the pointer would lose them. */
  readonly draggingIds: Set<string>;
  readonly visible: VisibleSet | null;

  paneSize: () => Size | null;
  setViewport: (viewport: Viewport) => Promise<boolean>;
  /** Client (screen) pixels to graph units. */
  toGraph: (clientX: number, clientY: number) => XYPosition;
  /** A node's own position, a drag included, relative to its parent. */
  resolvePosition: (id: string, fallback: XYPosition) => XYPosition;
  /** Its place on the canvas: its own position plus its ancestors'. */
  absolutePosition: (node: Node) => XYPosition;
  getNodeSize: (node: Node) => Size;
  /** A node — or a rect, or an id — as a box on the canvas; null for an id that is not there. */
  rectOf: (target: Node | Rect | { id: string }) => Rect | null;
  getNodeRect: (id: string) => Rect | null;
  /** The node as it stands now: dragged position, measured size, selection. */
  snapshotNode: (node: Node) => Node;
  snapshotEdge: (edge: Edge) => Edge;
  snapshotNodes: () => Node[];
  snapshotEdges: () => Edge[];

  /** Where each of a node's handles registered, in DOM order. */
  handlesOf: (nodeId: string) => Iterable<HandleRecord>;
  findHandle: (nodeId: string, handleId: string | null | undefined, type: HandleType) => HandleRecord | undefined;

  /** Whether someone listens for changes — the flow is then controlled, and changes are reported, not done. */
  nodesControlled: () => boolean;
  edgesControlled: () => boolean;
  emitNodeChanges: (changes: NodeChange[]) => void;
  emitEdgeChanges: (changes: EdgeChange[]) => void;
  /** Moves a node where nobody applies changes: remembered here, and drawn. */
  setNodePosition: (node: Node, position: XYPosition) => void;

  isSelected: (id: string) => boolean;
  isEdgeSelected: (id: string) => boolean;
  selectedNodeIds: () => string[];
  selectedEdgeIds: () => string[];
  /** Who is selected where nobody applies changes — a controlled element says so itself. Written by `selection`. */
  readonly ownSelection: { readonly nodes: Set<string>; readonly edges: Set<string> };
  /** Tells a node it needs drawing again (its position, or its selection, changed). */
  notifyNode: (id: string) => void;
  /** Says the edges need drawing again. */
  geometryChanged: () => void;
  /** Tells `onSelectionChange` and `useOnSelectionChange`, if the selection is not what they last heard. */
  announceSelection: () => void;

  /** The line being dragged out of a handle, as the edge layer draws it. */
  setConnection: (next: ConnectionState | null) => void;
  /** Which nodes and edges are worth drawing; null is all. Tells the canvas when it changes. */
  setVisible: (next: VisibleSet | null) => void;

  /** Runs `fn` when the event happens. */
  on: (event: FeatureEvent, fn: () => void) => void;
  /** Says the layout changed in a way `on('change')` would not otherwise hear of. */
  changed: () => void;
  /** Another feature's methods — it must be installed, which `needs` makes sure of. */
  api: <A>(feature: Feature<A>) => A;
}

export interface CanvasArgs {
  store: FlowingerStore;
  /** As the canvas was given them: a default is the feature's to apply. */
  props: FlowingerProps;
  /** A gesture of yours ends in a click that is not a click on the pane — say so, and the pane ignores it. */
  suppressPaneClick: () => void;
}

/** What a feature adds to the canvas's own handlers. Each returns whether it took the event. */
export interface CanvasBits {
  /** A press on the pane. Taking it stops it becoming a pan. */
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => boolean;
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => boolean;
  /** The pointer went up, or the browser cancelled it. */
  onPointerEnd?: (e: ReactPointerEvent<HTMLDivElement>) => boolean;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => boolean;
  /** Laid over the container's style, under the caller's own. */
  style?: CSSProperties;
  /** A click on the canvas should leave focus on it — a key handler hears nothing otherwise. */
  focusable?: boolean;
  /** The bare canvas was clicked (not the end of a pan, or of a gesture that said so). */
  onPaneClick?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  /**
   * More props for the container itself. Under the canvas's own — a feature adds a handler, it does not
   * replace one — and over none of the caller's.
   */
  props?: HTMLAttributes<HTMLDivElement>;
  /** Every edge takes the pointer, selectable or not: someone listens to events on edges. */
  edgesInteractive?: boolean;
  /**
   * Nodes and edges may be selected — which the canvas's `elementsSelectable` must also allow. Without it
   * they are drawn as unselectable, and are not reachable from the keyboard.
   */
  selectable?: boolean;
}

export interface NodeArgs {
  store: FlowingerStore;
  node: Node;
  /** Whether it may be dragged: the canvas's `nodesDraggable`, or the node's own say. */
  draggable: boolean;
  /** Whether a click, or Enter and Space, may select it: the canvas allows it, and the node has not opted out. */
  selectable: boolean;
  selected: boolean;
  /** Set it when a drag begins: the click that ends a drag is not a click on the node. */
  justDragged: MutableRefObject<boolean>;
}

/** What a feature adds to a node's own handlers. */
export interface NodeBits {
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** After `onNodeClick`, and not for the click that ends a drag. */
  onClick?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  /** Only heard while the node has focus itself, and no modifier is down — and the node is `focusable`. */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** A tab stop, and keys are heard: what `selectable` means for a node. */
  focusable?: boolean;
  /** Being dragged now: stacked above the rest, and given the `dragging` class. */
  dragging?: boolean;
  style?: CSSProperties;
  /** What a `<Handle>` inside the node calls to begin a connection; without it, handles only draw. */
  startConnection?: (handle: HTMLElement, at: PointerEvent) => void;
  /** More props for the node's element, under the ones the canvas puts there itself. */
  props?: HTMLAttributes<HTMLDivElement>;
}

export interface EdgeArgs {
  store: FlowingerStore;
  edge: Edge;
  /** Whether a click, or Enter and Space, may select it: the canvas allows it, and the edge has not opted out. */
  selectable: boolean;
}

/** What a feature adds to an edge's own handlers. */
export interface EdgeBits {
  /** After `onEdgeClick`. */
  onClick?: (e: ReactMouseEvent<SVGGElement>) => void;
  /** Only heard while the edge itself has focus, no modifier is down, and it is `selectable` and `edgesFocusable`. */
  onKeyDown?: (e: ReactKeyboardEvent<SVGGElement>) => void;
  /** More props for the edge's `<g>`, under the ones the canvas puts there itself. */
  props?: SVGAttributes<SVGGElement>;
  /** Draws the box behind an edge's label, when the edge asks for one (`labelShowBg`). */
  LabelBox?: ComponentType<LabelBoxProps>;
}

/**
 * What draws the box behind a label, around the label's own `<text>` (its `children`): the box goes first, so
 * it is behind. It is the text's parent so that its layout effect runs when the text has been laid out.
 */
export interface LabelBoxProps {
  children: ReactNode;
  textRef: RefObject<SVGTextElement | null>;
  /** What the label says and where it is — when either changes, the text needs measuring again. */
  label: string;
  x: number;
  y: number;
  /** The label's own style: a bigger font is a bigger box. */
  labelStyle: CSSProperties | undefined;
  /** `[x, y]` between the text and the edge of the box. */
  padding: [number, number];
  borderRadius: number;
  style: CSSProperties | undefined;
}

export interface EdgeAdornmentProps {
  edge: Edge;
  selected: boolean;
  selectable: boolean;
  /** Whether the canvas offers reconnecting at all (an `onReconnect` is there to hear of it). */
  reconnectable: boolean;
  source: XYPosition;
  target: XYPosition;
}

/** Puts a feature and everything it needs into installation order: needs first, each once. */
export function resolveFeatures(list: readonly Feature[]): Feature[] {
  const out: Feature[] = [];
  const seen = new Set<string>();
  const visit = (feature: Feature) => {
    if (seen.has(feature.name)) return;
    seen.add(feature.name);
    feature.needs?.forEach(visit);
    out.push(feature);
  };
  list.forEach(visit);
  return out;
}
