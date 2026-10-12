import { resolveFeatures, type EngineContext, type Feature, type FeatureEvent } from './features.ts';
import { absolutePositionOf, treeInfo } from './parents.ts';
import {
  FALLBACK_SIZE,
  getNodesBounds,
  snapTo,
  viewportForBounds,
  type Size,
} from './geometry.ts';
import { layoutSize } from './measure.ts';
import type {
  ConnectEndState,
  ConnectStartParams,
  Connection,
  ConnectionMode,
  Edge,
  EdgeChange,
  FitViewOptions,
  FlowingerInstance,
  HandleType,
  InternalNode,
  Node,
  NodeChange,
  NodeOrigin,
  Position,
  Rect,
  SetCenterOptions,
  SetViewportOptions,
  TranslateExtent,
  Viewport,
  XYPosition,
} from './types.ts';

type Listener = () => void;

export type { Size };

/** What a `<Handle>` tells the store about itself. */
/** What a `<Handle>` says about itself that can change without it registering again: read as a connection is dragged. */
export interface HandleOptions {
  isConnectableStart?: boolean | undefined;
  isConnectableEnd?: boolean | undefined;
  isValidConnection?: ((connection: Connection) => boolean) | undefined;
  onConnect?: ((connection: Connection) => void) | undefined;
}

export interface HandleRegistration {
  id: string | null;
  type: HandleType;
  position: Position;
  el: HTMLElement;
  options?: { current: HandleOptions };
}

/** A registered handle, plus where it actually sits — null until measured. */
export interface HandleRecord extends HandleRegistration {
  /** Where an edge attaches, relative to its node's top-left, in graph units: the handle's outer edge. */
  anchor: XYPosition | null;
}

/** What `useStore` selects from — the subset of React Flow's store shape that migrating code reads. */
export interface FlowingerState {
  /** Null until a canvas has mounted: viewport calls are meaningless before then. */
  panZoom: FlowingerInstance | null;
  isReady: boolean;
  /** As given to the canvas: a drag in an uncontrolled flow is not reflected in `position`. */
  nodes: readonly Node[];
  edges: readonly Edge[];
  /** `[x, y, zoom]`, as React Flow's `transform`. */
  transform: readonly [number, number, number];
  /** The pane's size in pixels; 0 until it has mounted. */
  width: number;
  height: number;
  minZoom: number;
  maxZoom: number;
  /** Whether every node has been measured. */
  nodesInitialized: boolean;
  onNodesChangeMiddlewareMap?: Map<symbol, (changes: NodeChange[]) => NodeChange[]>;
  onEdgesChangeMiddlewareMap?: Map<symbol, (changes: EdgeChange[]) => EdgeChange[]>;
}

/**
 * A connection being dragged out: from a handle, to wherever the pointer (or a handle it snapped to) is.
 * The engine's own shape — narrower than the public `ConnectionState` (see `connectionHook.ts`), which
 * resolves the ids here into node and handle objects lazily, only when something reads it.
 */
export interface DragConnection {
  start: XYPosition;
  startPosition: Position;
  fromNodeId: string;
  fromHandleId: string | null;
  fromHandleType: HandleType;
  end: XYPosition;
  endPosition: Position;
  /** The handle under the pointer, whether or not dropping there would connect — `null` over none. */
  toNodeId: string | null;
  toHandleId: string | null;
  toHandleType: HandleType | null;
  /** Over a handle that would make a valid connection, over one that would not, or over neither (null). */
  isValid: boolean | null;
  /** The edge whose end is being dragged, when this is a reconnection — it is not drawn meanwhile. */
  reconnecting: string | null;
}

/**
 * The view moved: `event` is what moved it — the pointer, the wheel — or null for a call (`setViewport`,
 * `fitView`, the keyboard, a `Controls` button); `viewport` is where it is.
 */
export type OnMove = (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void;

/** What listens to the view moving: the props of the same names, and `useOnViewportChange`. */
export type MoveListener = Pick<NodeCallbacks, 'onMoveStart' | 'onMove' | 'onMoveEnd'>;

export interface NodeCallbacks {
  onConnect?: ((connection: Connection) => void) | undefined;
  isValidConnection?: ((connection: Connection) => boolean) | undefined;
  onNodeClick?: ((event: React.MouseEvent, node: Node) => void) | undefined;
  onSelectionChange?: ((selection: { nodes: Node[]; edges: Edge[] }) => void) | undefined;
  onNodeDragStart?: ((event: React.PointerEvent, node: Node, nodes: Node[]) => void) | undefined;
  onNodeDrag?: ((event: React.PointerEvent, node: Node, nodes: Node[]) => void) | undefined;
  onNodeDragStop?: ((event: React.PointerEvent, node: Node, nodes: Node[]) => void) | undefined;
  onReconnect?: ((oldEdge: Edge, newConnection: Connection) => void) | undefined;
  onReconnectStart?: ((event: PointerEvent, edge: Edge, handleType: HandleType) => void) | undefined;
  onReconnectEnd?:
    | ((event: PointerEvent, edge: Edge, handleType: HandleType, state: ConnectEndState) => void)
    | undefined;
  onConnectStart?: ((event: PointerEvent, params: ConnectStartParams) => void) | undefined;
  onConnectEnd?: ((event: PointerEvent, state: ConnectEndState) => void) | undefined;
  onEdgeClick?: ((event: React.MouseEvent, edge: Edge) => void) | undefined;
  onMoveStart?: OnMove | undefined;
  onMove?: OnMove | undefined;
  onMoveEnd?: OnMove | undefined;
  /** Where the view is going: a report, or — with a controlled `viewport` — a request. */
  onViewportChange?: ((viewport: Viewport) => void) | undefined;
  onBeforeDelete?:
    | ((elements: { nodes: Node[]; edges: Edge[] }) => boolean | { nodes: Node[]; edges: Edge[] } | Promise<boolean | { nodes: Node[]; edges: Edge[] }>)
    | undefined;
  onNodesDelete?: ((nodes: Node[]) => void) | undefined;
  onEdgesDelete?: ((edges: Edge[]) => void) | undefined;
  onDelete?: ((elements: { nodes: Node[]; edges: Edge[] }) => void) | undefined;
  /** Given, it makes the *nodes* controlled: what happens is reported here, not done. */
  onNodesChange?: ((changes: NodeChange[]) => void) | undefined;
  /** The edge counterpart of `onNodesChange`. */
  onEdgesChange?: ((changes: EdgeChange[]) => void) | undefined;
}

/** The canvas's settings the store needs to act on a gesture. */
export interface EngineOptions {
  nodesDraggable: boolean;
  elementsSelectable: boolean;
  /** Round a dragged node's position to a multiple of these. */
  snapGrid: readonly [number, number] | null;
  /** Keep every dragged node inside this region of graph space. */
  nodeExtent: TranslateExtent | null;
  connectionMode: ConnectionMode;
  /** Draw only what is in view. */
  onlyRenderVisibleElements: boolean;
  autoPanOnNodeDrag: boolean;
  autoPanOnConnect: boolean;
  autoPanSpeed: number;
  /** Where a node's `position` is on it: `[0, 0]` its top-left corner, `[0.5, 0.5]` its centre. */
  nodeOrigin: NodeOrigin;
  /** Pixels a press must travel to become a node drag; null leaves it at the engine's own 3. */
  nodeDragThreshold: number | null;
}

/** The options a store starts with, before a canvas has told it otherwise. */
export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  nodesDraggable: false,
  elementsSelectable: false,
  snapGrid: null,
  nodeExtent: null,
  connectionMode: 'strict',
  onlyRenderVisibleElements: false,
  autoPanOnNodeDrag: true,
  autoPanOnConnect: true,
  autoPanSpeed: 15,
  nodeOrigin: [0, 0],
  nodeDragThreshold: null,
};


/** What is worth drawing right now — null means everything. */
export interface VisibleSet {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

const ZOOM_STEP = 1.25;
/** A backstop for the tween, see `setViewport`. */
const TWEEN_GRACE_MS = 100;

/**
 * The CSS transform for a viewport. Kept in one place because consumers and
 * browser tests match this exact format: `translate(0px, 0px) scale(1)` is the
 * identity, i.e. a viewport that has never moved.
 */
export const viewportTransform = (vp: Viewport): string =>
  `translate(${String(vp.x)}px, ${String(vp.y)}px) scale(${String(vp.zoom)})`;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const samePoint = (a: XYPosition, b: XYPosition): boolean => a.x === b.x && a.y === b.y;

/** By value: a caller passing a fresh array literal each render must not look like a change. */
const sameExtent = (a: TranslateExtent | null, b: TranslateExtent | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a[0][0] === b[0][0] &&
    a[0][1] === b[0][1] &&
    a[1][0] === b[1][0] &&
    a[1][1] === b[1][1]);

/** Whether two node lists lay out the same: same ids, positions and declared sizes, in order. */
const sameLayout = (a: readonly Node[], b: readonly Node[]): boolean =>
  a === b ||
  (a.length === b.length &&
    a.every((n, i) => {
      const m = b[i];
      return (
        m !== undefined &&
        n.id === m.id &&
        samePoint(n.position, m.position) &&
        n.width === m.width &&
        n.height === m.height &&
        n.hidden === m.hidden
      );
    }));

const sameAnchor = (a: XYPosition | null, b: XYPosition | null): boolean =>
  a === null || b === null ? a === b : samePoint(a, b);

/**
 * Where an edge attaches to a handle, inside its node, in graph units: the
 * handle's *outer* edge — the side facing away from the node — as in React
 * Flow, so an edge stops at the handle's dot rather than running into it (which
 * matters when the handle is invisible, or has an arrowhead pointing at it).
 *
 * Read from rects rather than offsets so a handle nested under a positioned
 * ancestor, or moved with a CSS transform, still reports where it is drawn.
 * Rects carry the viewport's zoom; dividing by the node's rendered-to-layout
 * width takes it back out. Null when either box has no size (jsdom,
 * `display: none`) — the caller then falls back to the side's midpoint.
 */
function anchorOf(handle: HTMLElement, node: HTMLElement, position: Position): XYPosition | null {
  const nodeRect = node.getBoundingClientRect();
  const layout = layoutSize(node);
  if (nodeRect.width === 0 || nodeRect.height === 0 || layout.width === 0) return null;
  const rect = handle.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const scale = nodeRect.width / layout.width;
  const x = (rect.left + rect.width / 2 - nodeRect.left) / scale;
  const y = (rect.top + rect.height / 2 - nodeRect.top) / scale;
  const halfW = rect.width / 2 / scale;
  const halfH = rect.height / 2 / scale;
  switch (position) {
    case 'top':
      return { x, y: y - halfH };
    case 'bottom':
      return { x, y: y + halfH };
    case 'left':
      return { x: x - halfW, y };
    case 'right':
      return { x: x + halfW, y };
  }
}

/**
 * The engine's state, held outside React.
 *
 * A pointer move must not re-render the graph. So the viewport
 * transform is written straight to the DOM, and the things that do need React
 * — a node's own position, the edge layer, the background pattern — subscribe
 * to just the slice they read through `useSyncExternalStore`.
 *
 * It also fixes an identity problem the earlier context-value design had. The
 * object handed to consumers here (`instance`) is created once and never
 * replaced, so an effect that depends on it runs once instead of once per
 * render. That matters to anything framing the diagram from `panZoom`: an
 * effect keyed on an instance rebuilt every render re-frames, and so
 * re-renders, without end.
 */
export function createFlowingerStore(
  initialViewport: Viewport = { x: 0, y: 0, zoom: 1 },
  initialBounds: { minZoom: number; maxZoom: number } = { minZoom: 0.05, maxZoom: 2 },
) {
  let viewport = initialViewport;
  /** The viewport the last `setViewport` asked for — equal to `viewport` once a tween lands. */
  let target = initialViewport;
  let { minZoom, maxZoom } = initialBounds;
  let extent: TranslateExtent | null = null;

  let viewportEl: HTMLElement | null = null;
  let containerEl: HTMLElement | null = null;
  let mounted = false;

  let nodes: readonly Node[] = [];
  let nodeById = new Map<string, Node>();
  let edges: readonly Edge[] = [];
  let edgeById = new Map<string, Edge>();
  let callbacks: NodeCallbacks = {};
  let options: EngineOptions = DEFAULT_ENGINE_OPTIONS;
  /** A dragged position, remembered with the prop position it was dragged *from*. */
  const overrides = new Map<string, { base: XYPosition; position: XYPosition }>();
  const sizes = new Map<string, Size>();
  /** Registered handles by node, in registration (DOM) order. */
  const handles = new Map<string, Set<HandleRecord>>();
  const nodeEls = new Map<string, HTMLElement>();
  /** Selected ids while the nodes / edges are *not* controlled; otherwise `selected` on the element says. */
  const selected = new Set<string>();
  const selectedEdges = new Set<string>();
  /** What `onSelectionChange` last heard, so it fires on a change and only then. */
  let announced = JSON.stringify([[], []]);
  /** The size last reported through a `dimensions` change, by node. */
  const reported = new Map<string, Size>();
  let connection: DragConnection | null = null;
  let stopObserving: (() => void) | null = null;
  let geometryVersion = 0;
  const onNodesChangeMiddlewareMap = new Map<symbol, (changes: NodeChange[]) => NodeChange[]>();
  const onEdgesChangeMiddlewareMap = new Map<symbol, (changes: EdgeChange[]) => EdgeChange[]>();

  const viewportListeners = new Set<Listener>();
  const geometryListeners = new Set<Listener>();
  const mountListeners = new Set<Listener>();
  const connectionListeners = new Set<Listener>();
  const stateListeners = new Set<Listener>();
  const selectionChangeListeners = new Set<Listener>();
  const visibleListeners = new Set<Listener>();
  /** The children of each parent, and each one's absolute position, as last worked out. */
  let childrenOf = new Map<string, string[]>();
  const absCache = new Map<string, XYPosition>();
  let visible: VisibleSet | null = null;
  /** Nodes being dragged right now: never culled, or the pointer would lose them. */
  const draggingIds = new Set<string>();
  const nodeListeners = new Map<string, Set<Listener>>();

  let tween: {
    frame: number;
    timer: ReturnType<typeof setTimeout>;
    resolve: (finished: boolean) => void;
  } | null = null;

  // A move begins with the first change of the view and ends when what is moving it stops: the pointer
  // going up (a pan, a pinch), the wheel going quiet, a tween landing — or, for a call that sets the view
  // in one go, at once.
  const moveListeners = new Set<MoveListener>();
  let moving = false;
  /** What is moving the view — a pan, a pinch, the wheel — and the event that began it. */
  let gesture: { event: MouseEvent | TouchEvent; quiet?: ReturnType<typeof setTimeout> } | null = null;
  const fireMove = (name: keyof MoveListener, vp: Viewport) => {
    const event = gesture?.event ?? null;
    callbacks[name]?.(event, vp);
    for (const listener of moveListeners) listener[name]?.(event, vp);
  };
  const endMove = () => {
    if (!moving) return;
    moving = false;
    fireMove('onMoveEnd', viewport);
  };
  const beginGesture = (event: MouseEvent | TouchEvent, quietMs?: number) => {
    clearTimeout(gesture?.quiet);
    gesture = { event, ...(quietMs === undefined ? {} : { quiet: setTimeout(endGesture, quietMs) }) };
  };
  /** `event` — what let go — is what the end reports, when given. */
  function endGesture(event?: MouseEvent | TouchEvent) {
    clearTimeout(gesture?.quiet);
    if (gesture && event) gesture.event = event;
    if (!tween) endMove();
    gesture = null;
  }

  const emit = (listeners: Iterable<Listener>) => {
    for (const listener of listeners) listener();
  };

  // `useStore`'s snapshot: rebuilt only after something it reads has changed, so
  // it is the same object between changes, as `useSyncExternalStore` requires.
  let stateVersion = 0;
  let cachedVersion = -1;
  let cachedState: FlowingerState | null = null;
  const touch = () => {
    stateVersion += 1;
    emit(stateListeners);
  };

  const subscribeTo =
    (listeners: Set<Listener>) =>
    (listener: Listener): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };

  const clampZoom = (zoom: number): number => Math.max(minZoom, Math.min(maxZoom, zoom));

  /**
   * Nudges a viewport so the visible region stays inside `extent`.
   *
   * d3-zoom's rule, per axis: measure how far each visible edge overshoots its
   * limit; if both cannot be satisfied (the extent is smaller than the pane)
   * centre it, else undo whichever overshoots. Needs the pane's size, so it
   * does nothing before the canvas has attached or while it measures zero.
   */
  const constrain = (vp: Viewport): Viewport => {
    if (!extent || !containerEl) return vp;
    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;
    if (width === 0 || height === 0) return vp;
    const [[minX, minY], [maxX, maxY]] = extent;
    const along = (offset: number, size: number, lo: number, hi: number): number => {
      const overLo = -offset / vp.zoom - lo;
      const overHi = (size - offset) / vp.zoom - hi;
      const shift = overHi > overLo ? (overLo + overHi) / 2 : Math.min(0, overLo) || Math.max(0, overHi);
      return offset + shift * vp.zoom;
    };
    return { x: along(vp.x, width, minX, maxX), y: along(vp.y, height, minY, maxY), zoom: vp.zoom };
  };

  // --- viewport -------------------------------------------------------------

  /**
   * Whether the owner holds the view (a `viewport` prop). Then nothing moves it here: every change is asked
   * of `onViewportChange`, and the view is whatever `syncViewport` is last given.
   */
  let viewportControlled = false;
  /** True while `syncViewport` is the one moving the view — its own change is not a request. */
  let syncing = false;
  /** What a controlled view last asked its owner for: the owner applying that is an echo, not a jump. */
  let asked: Viewport | null = null;

  const commitViewport = (next: Viewport) => {
    if (viewportControlled && !syncing) {
      // Ask, and stay put: what is asked for is not what is held, or a gesture would run ahead of an
      // owner that declined it.
      target = viewport;
      asked = next;
      callbacks.onViewportChange?.(next);
      return;
    }
    if (!moving) {
      moving = true;
      fireMove('onMoveStart', viewport);
    }
    viewport = next;
    if (viewportEl) viewportEl.style.transform = viewportTransform(next);
    emit(viewportListeners);
    touch();
    run('change');
    fireMove('onMove', next);
    if (!gesture && !tween) endMove();
    if (!syncing) callbacks.onViewportChange?.(next);
  };

  /**
   * Puts the view where a controlled `viewport` says. If that is what was just asked for, it is the owner
   * following an animation or a gesture frame by frame, and must not stop it; if it is anything else, the
   * owner has moved the view itself, and whatever was animating it is over.
   */
  const syncViewport = (vp: Viewport) => {
    if (vp.x === viewport.x && vp.y === viewport.y && vp.zoom === viewport.zoom) {
      if (!tween) target = vp;
      return;
    }
    const echo = asked !== null && asked.x === vp.x && asked.y === vp.y && asked.zoom === vp.zoom;
    if (!echo) {
      cancelTween();
      target = vp;
    } else if (!tween) {
      target = vp;
    }
    syncing = true;
    try {
      commitViewport(vp);
    } finally {
      syncing = false;
    }
  };

  /** Stops a tween. Whoever awaited it hears `finished` — false when something interrupted it. */
  const cancelTween = (finished = false) => {
    if (!tween) return;
    const { frame, timer, resolve } = tween;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    tween = null;
    resolve(finished);
  };

  /**
   * Moves the viewport, instantly or over `duration` ms.
   *
   * The tween is our own rather than a CSS transition so that everything
   * reading the viewport — the background pattern, `getViewport()`, a zoom
   * button pressed mid-move — sees the same value the pixels do.
   *
   * `requestAnimationFrame` does not fire in a hidden tab, and a tween that
   * never ticks would leave the viewport where it started, silently. So a
   * hidden tab snaps, and a timer lands the move if frames stop arriving
   * part-way through.
   */
  const setViewport = (requested: Viewport, options?: SetViewportOptions): Promise<boolean> => {
    const to = constrain({ ...requested, zoom: clampZoom(requested.zoom) });
    const duration = options?.duration ?? 0;
    const ease = options?.ease ?? easeOutCubic;
    target = to;
    cancelTween();

    if (duration <= 0 || document.hidden || prefersReducedMotion()) {
      commitViewport(to);
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      const from = viewport;
      const start = performance.now();
      const land = () => {
        cancelTween(true);
        commitViewport(to);
      };
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        if (t >= 1) {
          land();
          return;
        }
        const e = ease(t);
        commitViewport({
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          zoom: from.zoom + (to.zoom - from.zoom) * e,
        });
        if (tween) tween.frame = requestAnimationFrame(tick);
      };
      tween = {
        frame: requestAnimationFrame(tick),
        timer: setTimeout(land, duration + TWEEN_GRACE_MS),
        resolve,
      };
    });
  };

  /** Zooms by `factor`, keeping the point (`cx`, `cy`) — in container pixels — fixed. */
  const zoomAt = (
    factor: number,
    cx: number,
    cy: number,
    options?: SetViewportOptions,
  ): Promise<boolean> => {
    const zoom = clampZoom(target.zoom * factor);
    if (zoom === target.zoom) return Promise.resolve(false);
    const k = zoom / target.zoom;
    return setViewport({ x: cx - (cx - target.x) * k, y: cy - (cy - target.y) * k, zoom }, options);
  };

  const centre = (): XYPosition => ({
    x: (containerEl?.clientWidth ?? 0) / 2,
    y: (containerEl?.clientHeight ?? 0) / 2,
  });

  // --- features ---------------------------------------------------------------

  /** What features asked to hear of. */
  const hooks: Record<FeatureEvent, Listener[]> = { change: [], detach: [] };
  const run = (event: FeatureEvent) => {
    for (const fn of hooks[event]) fn();
  };

  // --- geometry -------------------------------------------------------------

  const bumpGeometry = () => {
    geometryVersion += 1;
    emit(geometryListeners);
    touch();
    run('change');
  };

  const resolvePosition = (id: string, fallback: XYPosition): XYPosition => {
    const dragged = overrides.get(id);
    // A drag only stands while the prop position it started from does: if the
    // parent has since laid the node out somewhere new, that layout wins.
    return dragged && samePoint(dragged.base, fallback) ? dragged.position : fallback;
  };

  const getNodeSize = (node: Node): Size =>
    sizes.get(node.id) ?? {
      width: node.width ?? node.initialWidth ?? FALLBACK_SIZE.width,
      height: node.height ?? node.initialHeight ?? FALLBACK_SIZE.height,
    };

  /** Whether the pan-activation key is held — set by `panKeyFeature`, read by the canvas when a press begins. */
  let panKeyHeld = false;
  const NO_OFFSET: XYPosition = { x: 0, y: 0 };
  const NO_ORIGIN: NodeOrigin = [0, 0];
  /** A node's origin: its own, else the canvas's. `[0, 0]` is `position` being its top-left corner. */
  const hasOrigin = (n: Node): boolean => {
    const o = n.origin ?? options.nodeOrigin;
    return o[0] !== 0 || o[1] !== 0;
  };
  /** How far a node's top-left corner is from its `position`: its origin times its size. */
  const originOffset = (n: Node): XYPosition => {
    const o = n.origin ?? options.nodeOrigin;
    if (o[0] === 0 && o[1] === 0) return NO_OFFSET;
    const size = getNodeSize(n);
    return { x: o[0] * size.width, y: o[1] * size.height };
  };

  /**
   * A node's top-left corner on the canvas: its position — a drag included — less its origin's share of its
   * size, plus the same for every ancestor (a child's `position` is relative to its parent's top-left). For
   * a root with no origin that is `resolvePosition` itself; otherwise it is remembered by id so
   * `useSyncExternalStore` gets the same object until it moves.
   */
  const absolutePosition = (node: Node): XYPosition => {
    if (node.parentId === undefined && !hasOrigin(node)) return resolvePosition(node.id, node.position);
    const at = absolutePositionOf(node, (id) => nodeById.get(id), resolvePosition, originOffset);
    const known = absCache.get(node.id);
    if (known && samePoint(known, at)) return known;
    absCache.set(node.id, at);
    return at;
  };

  /** Tells a node, and everything nested inside it, that it moved. */
  const emitNodeTree = (id: string) => {
    emit(nodeListeners.get(id) ?? []);
    const queue = [...(childrenOf.get(id) ?? [])];
    const seen = new Set([id]);
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      if (seen.has(next)) continue;
      seen.add(next);
      emit(nodeListeners.get(next) ?? []);
      queue.push(...(childrenOf.get(next) ?? []));
    }
  };

  const setNodePosition = (node: Node, position: XYPosition) => {
    overrides.set(node.id, { base: node.position, position });
    bumpGeometry();
    emitNodeTree(node.id);
  };

  const nodesControlled = (): boolean => callbacks.onNodesChange !== undefined;
  const edgesControlled = (): boolean => callbacks.onEdgesChange !== undefined;

  const emitNodeChanges = (changes: NodeChange[]) => {
    if (changes.length === 0) return;
    let next = changes;
    for (const middleware of onNodesChangeMiddlewareMap.values()) {
      next = middleware(next);
    }
    if (next.length > 0) callbacks.onNodesChange?.(next);
  };
  const emitEdgeChanges = (changes: EdgeChange[]) => {
    if (changes.length === 0) return;
    let next = changes;
    for (const middleware of onEdgesChangeMiddlewareMap.values()) {
      next = middleware(next);
    }
    if (next.length > 0) callbacks.onEdgesChange?.(next);
  };

  /**
   * Tells a controlled flow the sizes it has not heard yet. Runs after a
   * measurement and after the nodes arrive — the first measurements happen
   * before the canvas has registered either the nodes or the callback.
   */
  const flushDimensions = () => {
    if (!nodesControlled()) return;
    const changes: NodeChange[] = [];
    for (const [id, size] of sizes) {
      const node = nodeById.get(id);
      const last = reported.get(id);
      if (!node || (last?.width === size.width && last.height === size.height)) continue;
      reported.set(id, size);
      if (node.measured?.width === size.width && node.measured.height === size.height) continue;
      changes.push({ type: 'dimensions', id, dimensions: { width: size.width, height: size.height } });
    }
    emitNodeChanges(changes);
  };

  /** Records a measured size. Ignores zero — an unmeasurable node keeps its declared size. */
  const setSize = (id: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const known = sizes.get(id);
    if (known?.width === width && known.height === height) return;
    sizes.set(id, { width, height });
    bumpGeometry();
    // With an origin, where the top-left is depends on the size: tell the node, and what is inside it.
    const measured = nodeById.get(id);
    if (measured && hasOrigin(measured)) emitNodeTree(id);
    flushDimensions();
  };

  /** Whether every node that is drawn has been measured — false for an empty diagram. */
  const areNodesInitialized = (): boolean =>
    nodes.length > 0 && nodes.every((n) => n.hidden === true || sizes.has(n.id));

  /** Lets handle measurement find the node a handle belongs to. Returns its cleanup. */
  const registerNodeElement = (id: string, el: HTMLElement): (() => void) => {
    nodeEls.set(id, el);
    return () => {
      if (nodeEls.get(id) === el) nodeEls.delete(id);
    };
  };

  /** Reads a node's size and where its handles sit, again: something it is made of has changed. */
  const remeasure = (id: string) => {
    const el = nodeEls.get(id);
    if (!el) return;
    const { width, height } = layoutSize(el);
    setSize(id, width, height);
    measureHandles(id);
  };

  /** Re-reads where each of a node's handles sits. Bumps geometry only if one moved. */
  const measureHandles = (nodeId: string) => {
    const records = handles.get(nodeId);
    const nodeEl = nodeEls.get(nodeId);
    if (!records || !nodeEl) return;
    let changed = false;
    for (const record of records) {
      const next = anchorOf(record.el, nodeEl, record.position);
      if (!sameAnchor(record.anchor, next)) {
        record.anchor = next;
        changed = true;
      }
    }
    if (changed) bumpGeometry();
  };

  const registerHandle = (nodeId: string, registration: HandleRegistration): (() => void) => {
    const record: HandleRecord = { ...registration, anchor: null };
    let records = handles.get(nodeId);
    if (!records) {
      records = new Set();
      handles.set(nodeId, records);
    }
    records.add(record);
    measureHandles(nodeId);
    bumpGeometry();
    return () => {
      records.delete(record);
      if (records.size === 0 && handles.get(nodeId) === records) handles.delete(nodeId);
      bumpGeometry();
    };
  };

  /**
   * The handle an edge end refers to: a handle of `type` with that `id`, or —
   * with no id — the first handle of that type, as React Flow does. Undefined
   * when there is none, and the edge layer then falls back to guessing.
   */
  const findHandle = (
    nodeId: string,
    handleId: string | null | undefined,
    type: HandleType,
  ): HandleRecord | undefined => {
    const records = handles.get(nodeId);
    if (!records) return undefined;
    for (const record of records) {
      if (record.type !== type) continue;
      if (handleId === null || handleId === undefined || record.id === handleId) return record;
    }
    return undefined;
  };

  // --- connecting -----------------------------------------------------------

  const setConnection = (next: DragConnection | null) => {
    connection = next;
    emit(connectionListeners);
  };

  const toGraph = (clientX: number, clientY: number): XYPosition => {
    const rect = containerEl?.getBoundingClientRect();
    return {
      x: (clientX - (rect?.left ?? 0) - viewport.x) / viewport.zoom,
      y: (clientY - (rect?.top ?? 0) - viewport.y) / viewport.zoom,
    };
  };

  // --- selection ------------------------------------------------------------

  /** Controlled, the element says; otherwise the store's own set does. */
  const isSelected = (id: string): boolean =>
    nodesControlled() ? nodeById.get(id)?.selected === true : selected.has(id);
  const isEdgeSelected = (id: string): boolean =>
    edgesControlled() ? edgeById.get(id)?.selected === true : selectedEdges.has(id);

  const selectedNodeIds = (): string[] => nodes.filter((n) => isSelected(n.id)).map((n) => n.id);
  const selectedEdgeIds = (): string[] => edges.filter((e) => isEdgeSelected(e.id)).map((e) => e.id);

  /** Tells `onSelectionChange` — once per change, and never for a selection that has not changed. */
  const announceIfChanged = () => {
    const nodeIds = selectedNodeIds();
    const edgeIds = selectedEdgeIds();
    const key = JSON.stringify([nodeIds, edgeIds]);
    if (key === announced) return;
    announced = key;
    emit(selectionChangeListeners);
    callbacks.onSelectionChange?.({
      nodes: nodeIds.flatMap((id) => nodeById.get(id) ?? []),
      edges: edgeIds.flatMap((id) => edgeById.get(id) ?? []),
    });
  };

  /** Where a node is and how big, in graph units: the dragged position, the measured size. */
  const getNodeRect = (id: string): Rect | null => {
    const n = nodeById.get(id);
    if (!n) return null;
    // In the node's own space — relative to its parent's top-left, which is where a position is written —
    // and its top-left corner, whatever its origin is.
    const pos = resolvePosition(id, n.position);
    const offset = originOffset(n);
    return { x: pos.x - offset.x, y: pos.y - offset.y, ...getNodeSize(n) };
  };

  /** The selection as it stands, as elements. */
  const getSelection = (): { nodes: Node[]; edges: Edge[] } => ({
    nodes: selectedNodeIds().flatMap((id) => nodeById.get(id) ?? []),
    edges: selectedEdgeIds().flatMap((id) => edgeById.get(id) ?? []),
  });

  const hasSelection = (): boolean => selectedNodeIds().length > 0 || selectedEdgeIds().length > 0;

  // --- what the canvas hands over ------------------------------------------

  const setNodes = (next: readonly Node[]) => {
    // Anything drawing from geometry (the edge layer, a minimap) must hear of a
    // new layout, not only of a measurement or a drag.
    const relaid = !sameLayout(nodes, next);
    const before = nodeById;
    nodes = next;
    nodeById = new Map(next.map((n) => [n.id, n]));
    childrenOf = new Map();
    for (const n of next) {
      if (n.parentId === undefined) continue;
      const list = childrenOf.get(n.parentId);
      if (list) list.push(n.id);
      else childrenOf.set(n.parentId, [n.id]);
    }
    absCache.clear();
    let pruned = false;
    for (const id of [...sizes.keys()]) {
      if (!nodeById.has(id)) {
        sizes.delete(id);
        reported.delete(id);
        pruned = true;
      }
    }
    for (const [id, dragged] of [...overrides]) {
      const node = nodeById.get(id);
      if (!node || !samePoint(node.position, dragged.base)) {
        overrides.delete(id);
        pruned = true;
      }
    }
    for (const id of [...selected]) if (!nodeById.has(id)) selected.delete(id);
    // A controlled node's selection lives on the node: whoever it flipped for must redraw.
    if (nodesControlled()) {
      for (const n of next) {
        if ((before.get(n.id)?.selected === true) !== (n.selected === true)) {
          emit(nodeListeners.get(n.id) ?? []);
        }
      }
    }
    if (pruned || relaid) bumpGeometry();
    else {
      touch();
      run('change');
    }
    // A child's place depends on its ancestors', which this may have moved.
    if (relaid) for (const [, ids] of childrenOf) for (const id of ids) emit(nodeListeners.get(id) ?? []);
    announceIfChanged();
    flushDimensions();
  };

  const setEdges = (next: readonly Edge[]) => {
    edges = next;
    edgeById = new Map(next.map((e) => [e.id, e]));
    for (const id of [...selectedEdges]) if (!edgeById.has(id)) selectedEdges.delete(id);
    touch();
    run('change');
    announceIfChanged();
  };

  const setVisible = (next: VisibleSet | null) => {
    visible = next;
    emit(visibleListeners);
  };

  /** The pane, in pixels — null before a canvas has attached, or while it has no size. */
  const paneSize = (): Size | null => {
    if (!containerEl) return null;
    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;
    return width === 0 || height === 0 ? null : { width, height };
  };

  /** A node as it stands now: dragged position, measured size, selection. */
  const snapshotNode = (n: Node): Node => {
    const position = resolvePosition(n.id, n.position);
    const selectedNow = isSelected(n.id);
    const size = sizes.get(n.id);
    const measured = n.measured ?? (size ? { width: size.width, height: size.height } : undefined);
    if (position === n.position && (n.selected === true) === selectedNow && measured === n.measured) return n;
    return { ...n, position, selected: selectedNow, ...(measured ? { measured } : {}) };
  };

  const snapshotEdge = (e: Edge): Edge => (isEdgeSelected(e.id) === (e.selected === true) ? e : { ...e, selected: !e.selected });

  /** A node's position, plus its ancestors' — `absolutePosition` — and its stacking order, as drawn. */
  const getInternalNode = (id: string): InternalNode | undefined => {
    const node = nodeById.get(id);
    if (!node) return undefined;
    const depth = treeInfo(nodes).depth.get(id) ?? 0;
    return {
      ...snapshotNode(node),
      internals: { positionAbsolute: absolutePosition(node), z: node.zIndex ?? 1 + depth },
    };
  };

  const boundsOfNodes = (list: readonly Node[], opts?: { nodeOrigin?: NodeOrigin }): Rect =>
    getNodesBounds(
      list.map((n) => ({
        ...snapshotNode(n),
        // The top-left, already — so no origin to take off again. An origin asked for explicitly is the
        // origin of the position as given: the canvas's own, and the node's, are set aside.
        position: opts?.nodeOrigin ? absolutePositionOf(n, (id) => nodeById.get(id), resolvePosition) : absolutePosition(n),
        origin: opts?.nodeOrigin ?? NO_ORIGIN,
        measured: sizes.get(n.id) ?? n.measured,
      })),
    );


  const fitBounds = (bounds: Rect, opts?: FitViewOptions): Promise<boolean> => {
    const pane = paneSize();
    if (!pane) return Promise.resolve(false);
    return setViewport(
      viewportForBounds(
        bounds,
        pane.width,
        pane.height,
        opts?.minZoom ?? minZoom,
        opts?.maxZoom ?? maxZoom,
        opts?.padding,
      ),
      opts,
    );
  };

  const fitView = (opts?: FitViewOptions): Promise<boolean> => {
    const wanted = opts?.nodes ? new Set(opts.nodes.map((n) => n.id)) : null;
    const list = nodes.filter(
      (n) => (opts?.includeHiddenNodes === true || n.hidden !== true) && (!wanted || wanted.has(n.id)),
    );
    if (list.length === 0) return Promise.resolve(false);
    return fitBounds(boundsOfNodes(list), opts);
  };

  const setCenter = (x: number, y: number, opts?: SetCenterOptions): Promise<boolean> => {
    const pane = paneSize();
    if (!pane) return Promise.resolve(false);
    const zoom = clampZoom(opts?.zoom ?? target.zoom);
    return setViewport({ x: pane.width / 2 - x * zoom, y: pane.height / 2 - y * zoom, zoom }, opts);
  };

  const zoomTo = (zoom: number, opts?: SetViewportOptions): Promise<boolean> => {
    const c = centre();
    return zoomAt(zoom / target.zoom, c.x, c.y, opts);
  };

  // --- reading and editing the graph from outside ---------------------------

  const screenToFlowPosition = (p: XYPosition, opts?: { snapToGrid?: boolean }): XYPosition => {
    const at = toGraph(p.x, p.y);
    const grid = options.snapGrid;
    return opts?.snapToGrid && grid ? { x: snapTo(at.x, grid[0]), y: snapTo(at.y, grid[1]) } : at;
  };

  const flowToScreenPosition = (p: XYPosition): XYPosition => {
    const rect = containerEl?.getBoundingClientRect();
    return {
      x: (rect?.left ?? 0) + viewport.x + p.x * viewport.zoom,
      y: (rect?.top ?? 0) + viewport.y + p.y * viewport.zoom,
    };
  };

  const getNodesNow = (): Node[] => nodes.map(snapshotNode);
  const getEdgesNow = (): Edge[] => edges.map(snapshotEdge);

  const rectOf = (target: Node | Rect | { id: string }): Rect | null => {
    if ('width' in target && 'x' in target) return target;
    const n = nodeById.get(target.id);
    if (!n) return null;
    const at = absolutePosition(n);
    const size = sizes.get(n.id) ?? getNodeSize(n);
    return { x: at.x, y: at.y, ...size };
  };

  // --- lifecycle ------------------------------------------------------------

  const attach = (viewportElement: HTMLElement, container: HTMLElement) => {
    viewportEl = viewportElement;
    containerEl = container;
    // A remount (StrictMode's, or a route change back) gets the viewport it left.
    viewportEl.style.transform = viewportTransform(viewport);
    stopObserving?.();
    if (typeof ResizeObserver !== 'undefined') {
      // A resized pane changes what a minimap should show as "visible".
      let width = container.clientWidth;
      let height = container.clientHeight;
      const observer = new ResizeObserver(() => {
        if (container.clientWidth === width && container.clientHeight === height) return;
        width = container.clientWidth;
        height = container.clientHeight;
        bumpGeometry();
      });
      observer.observe(container);
      stopObserving = () => { observer.disconnect(); };
    }
    mounted = true;
    emit(mountListeners);
    touch();
  };

  const detach = () => {
    cancelTween();
    endGesture();
    run('detach');
    stopObserving?.();
    stopObserving = null;
    viewportEl = null;
    containerEl = null;
    mounted = false;
    emit(mountListeners);
    touch();
  };

  const getState = (): FlowingerState => {
    if (cachedState === null || cachedVersion !== stateVersion) {
      cachedVersion = stateVersion;
      cachedState = {
        panZoom: mounted ? instance : null,
        isReady: mounted,
        nodes,
        edges,
        transform: [viewport.x, viewport.y, viewport.zoom],
        width: containerEl?.clientWidth ?? 0,
        height: containerEl?.clientHeight ?? 0,
        minZoom,
        maxZoom,
        nodesInitialized: areNodesInitialized(),
        onNodesChangeMiddlewareMap,
        onEdgesChangeMiddlewareMap,
      };
    }
    return cachedState;
  };

  // --- features -------------------------------------------------------------

  const installed = new Map<string, unknown>();

  const api = <A,>(feature: Feature<A>): A => {
    if (!installed.has(feature.name)) {
      throw new Error(`flowinger: the "${feature.name}" feature is not enabled — pass it in \`features\``);
    }
    return installed.get(feature.name) as A;
  };

  /** What features are handed: the parts of the store they build on. */
  const ctx: EngineContext = {
    get nodes() {
      return nodes;
    },
    get edges() {
      return edges;
    },
    get nodeById() {
      return nodeById;
    },
    get edgeById() {
      return edgeById;
    },
    get childrenOf() {
      return childrenOf;
    },
    get options() {
      return options;
    },
    get callbacks() {
      return callbacks;
    },
    get viewport() {
      return viewport;
    },
    get container() {
      return containerEl;
    },
    get visible() {
      return visible;
    },
    reported,
    draggingIds,
    paneSize,
    setViewport: (next) => setViewport(next),
    toGraph,
    resolvePosition,
    absolutePosition,
    getNodeSize,
    rectOf,
    getNodeRect,
    snapshotNode,
    snapshotEdge,
    snapshotNodes: getNodesNow,
    snapshotEdges: getEdgesNow,
    handlesOf: (nodeId) => handles.get(nodeId) ?? [],
    findHandle,
    nodesControlled,
    edgesControlled,
    emitNodeChanges,
    emitEdgeChanges,
    setNodePosition,
    isSelected,
    isEdgeSelected,
    selectedNodeIds,
    selectedEdgeIds,
    ownSelection: { nodes: selected, edges: selectedEdges },
    notifyNode: (id) => {
      emit(nodeListeners.get(id) ?? []);
    },
    geometryChanged: bumpGeometry,
    announceSelection: announceIfChanged,
    setConnection,
    setVisible,
    on: (event, fn) => {
      hooks[event].push(fn);
    },
    changed: () => {
      run('change');
    },
    api,
  };

  /**
   * An instance method a feature supplies. It is there from the start, so code that took it off the
   * instance before the canvas rendered — `const { setNodes } = useReactFlow()` — still holds a working
   * one; it says so plainly if the feature was never given.
   */
  const lend = <T extends (...args: never[]) => unknown>(feature: string, method: string): T =>
    ((...args: unknown[]) => {
      const impl = (installed.get(feature) as Record<string, ((...a: unknown[]) => unknown) | undefined> | undefined)?.[
        method
      ];
      if (!impl) {
        throw new Error(`flowinger: ${method} needs the "${feature}" feature — pass it in \`features\``);
      }
      return impl(...args);
    }) as unknown as T;

  /** Installs features, and whatever they need, that are not installed yet. */
  const use = (list: readonly Feature[]) => {
    for (const feature of resolveFeatures(list)) {
      if (!installed.has(feature.name)) installed.set(feature.name, feature.install?.(ctx));
    }
  };

  /** Created once. Its identity is the contract: it never changes. */
  const instance: FlowingerInstance = {
    get viewportInitialized() {
      return mounted;
    },
    setViewport,
    getViewport: () => viewport,
    getZoom: () => viewport.zoom,
    zoomIn: (options) => {
      const c = centre();
      return zoomAt(ZOOM_STEP, c.x, c.y, options);
    },
    zoomOut: (options) => {
      const c = centre();
      return zoomAt(1 / ZOOM_STEP, c.x, c.y, options);
    },
    zoomTo,
    setCenter,
    fitView,
    fitBounds,
    screenToFlowPosition,
    flowToScreenPosition,
    getNodes: getNodesNow,
    getNode: (id) => {
      const n = nodeById.get(id);
      return n && snapshotNode(n);
    },
    getInternalNode,
    getEdges: getEdgesNow,
    getEdge: (id) => {
      const e = edgeById.get(id);
      return e && snapshotEdge(e);
    },
    setNodes: lend('editing', 'setNodes'),
    setEdges: lend('editing', 'setEdges'),
    addNodes: lend('editing', 'addNodes'),
    addEdges: lend('editing', 'addEdges'),
    updateNode: lend('editing', 'updateNode'),
    updateNodeData: lend('editing', 'updateNodeData'),
    updateEdge: lend('editing', 'updateEdge'),
    updateEdgeData: lend('editing', 'updateEdgeData'),
    getIntersectingNodes: lend('editing', 'getIntersectingNodes'),
    isNodeIntersecting: lend('editing', 'isNodeIntersecting'),
    getNodesBounds: (list, opts) =>
      boundsOfNodes(
        list.flatMap((n) => (typeof n === 'string' ? (nodeById.get(n) ?? []) : n)),
        opts,
      ),
    getNodeConnections: lend('editing', 'getNodeConnections'),
    getHandleConnections: lend('editing', 'getHandleConnections'),
    toObject: () => ({ nodes: getNodesNow(), edges: getEdgesNow(), viewport }),
    deleteElements: lend('delete', 'deleteElements'),
  };

  return {
    instance,
    use,
    api,
    attach,
    detach,
    zoomAt,
    fitView,
    beginGesture,
    endGesture,
    onMove: (listener: MoveListener): (() => void) => {
      moveListeners.add(listener);
      return () => {
        moveListeners.delete(listener);
      };
    },
    setViewportControlled: (controlled: boolean) => {
      viewportControlled = controlled;
    },
    syncViewport,
    setBounds: (min: number, max: number, nextExtent: TranslateExtent | null = null) => {
      minZoom = min;
      maxZoom = max;
      touch();
      const changed = !sameExtent(extent, nextExtent);
      extent = nextExtent;
      // A tighter extent can leave the view outside it: bring it back in.
      if (changed && extent) instance.setViewport(viewport);
    },
    setNodes,
    setEdges,
    setCallbacks: (next: NodeCallbacks) => {
      callbacks = next;
    },
    setOptions: (next: EngineOptions) => {
      const moved = next.nodeOrigin[0] !== options.nodeOrigin[0] || next.nodeOrigin[1] !== options.nodeOrigin[1];
      options = next;
      // The canvas's origin changed: every node without one of its own is somewhere else.
      if (moved) {
        absCache.clear();
        bumpGeometry();
        for (const listeners of nodeListeners.values()) emit(listeners);
      }
      run('change');
    },
    getOptions: () => options,
    getCallbacks: () => callbacks,

    getViewport: () => viewport,
    getState,
    getGeometryVersion: () => geometryVersion,

    setPanKeyHeld: (held: boolean) => {
      panKeyHeld = held;
    },
    isPanKeyHeld: () => panKeyHeld,
    resolvePosition,
    absolutePosition,
    originOffset,
    getNodeSize,
    getVisible: (): VisibleSet | null => visible,
    subscribeVisible: subscribeTo(visibleListeners),
    setNodePosition,
    setSize,
    registerNodeElement,
    registerHandle,
    measureHandles,
    remeasure,
    findHandle,
    getConnection: () => connection,
    getNodes: (): readonly Node[] => nodes,
    getContainerSize: (): Size | null =>
      containerEl ? { width: containerEl.clientWidth, height: containerEl.clientHeight } : null,
    subscribeConnection: subscribeTo(connectionListeners),
    isSelected,
    isEdgeSelected,
    hasSelection,
    getNodeRect,
    getInternalNode,
    getSelectedNodeCount: (): number => selectedNodeIds().length,
    subscribeSelection: subscribeTo(selectionChangeListeners),
    getSelection,
    areNodesInitialized,
    emitNodeChanges,
    emitEdgeChanges,
    onNodesChangeMiddlewareMap,
    onEdgesChangeMiddlewareMap,

    subscribeViewport: subscribeTo(viewportListeners),
    subscribeGeometry: subscribeTo(geometryListeners),
    subscribeMount: subscribeTo(mountListeners),
    subscribeState: subscribeTo(stateListeners),
    subscribeNode: (id: string, listener: Listener): (() => void) => {
      let set = nodeListeners.get(id);
      if (!set) {
        set = new Set();
        nodeListeners.set(id, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) nodeListeners.delete(id);
      };
    },
  };
}

export type FlowingerStore = ReturnType<typeof createFlowingerStore>;
