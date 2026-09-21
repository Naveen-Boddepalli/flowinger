import { handleCoordinates } from './handlePoint.ts';
import type {
  Connection,
  FlowingerInstance,
  HandleType,
  Node,
  Position,
  SetViewportOptions,
  TranslateExtent,
  Viewport,
  XYPosition,
} from './types.ts';

type Listener = () => void;

export interface Size {
  width: number;
  height: number;
}

/** What a `<Handle>` tells the store about itself. */
export interface HandleRegistration {
  id: string | null;
  type: HandleType;
  position: Position;
  el: HTMLElement;
}

/** A registered handle, plus where it actually sits — null until measured. */
export interface HandleRecord extends HandleRegistration {
  /** Centre of the handle relative to its node's top-left, in graph units. */
  anchor: XYPosition | null;
}

/** What `useStore` selects from — the subset of React Flow's store shape that migrating code reads. */
export interface FlowingerState {
  /** Null until a canvas has mounted: viewport calls are meaningless before then. */
  panZoom: FlowingerInstance | null;
  isReady: boolean;
}

/** A connection being dragged out: from a handle, to wherever the pointer (or a handle it snapped to) is. */
export interface ConnectionState {
  start: XYPosition;
  startPosition: Position;
  end: XYPosition;
  endPosition: Position;
}

/** Where a connection end lives: a node, one of its handles by id (null = unnamed), and that handle's type. */
interface Endpoint {
  nodeId: string;
  id: string | null;
  type: HandleType;
}

const OPPOSITE: Record<Position, Position> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

export interface NodeCallbacks {
  onConnect?: ((connection: Connection) => void) | undefined;
  isValidConnection?: ((connection: Connection) => boolean) | undefined;
  onNodeClick?: ((event: React.MouseEvent, node: Node) => void) | undefined;
  onSelectionChange?: ((selection: { nodes: Node[] }) => void) | undefined;
  onNodeDrag?: ((event: React.PointerEvent, node: Node) => void) | undefined;
  onNodeDragStop?: ((event: React.PointerEvent, node: Node) => void) | undefined;
}

/**
 * The size a node is assumed to be until it has been measured, and the size
 * `fitView` uses for a node that never reports one (jsdom, `display: none`).
 */
const FALLBACK_SIZE: Size = { width: 150, height: 40 };

const FIT_PADDING = 40;
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

const sameAnchor = (a: XYPosition | null, b: XYPosition | null): boolean =>
  a === null || b === null ? a === b : samePoint(a, b);

/**
 * Where a handle's centre sits inside its node, in graph units.
 *
 * Read from rects rather than offsets so a handle nested under a positioned
 * ancestor, or moved with a CSS transform, still reports where it is drawn.
 * Rects carry the viewport's zoom; dividing by the node's rendered-to-layout
 * width takes it back out. Null when either box has no size (jsdom,
 * `display: none`) — the caller then falls back to the side's midpoint.
 */
function anchorOf(handle: HTMLElement, node: HTMLElement): XYPosition | null {
  const nodeRect = node.getBoundingClientRect();
  const layoutWidth = node.offsetWidth;
  if (nodeRect.width === 0 || nodeRect.height === 0 || layoutWidth === 0) return null;
  const rect = handle.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const scale = nodeRect.width / layoutWidth;
  return {
    x: (rect.left + rect.width / 2 - nodeRect.left) / scale,
    y: (rect.top + rect.height / 2 - nodeRect.top) / scale,
  };
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
  let state: FlowingerState = { panZoom: null, isReady: false };

  let nodes: readonly Node[] = [];
  let callbacks: NodeCallbacks = {};
  /** A dragged position, remembered with the prop position it was dragged *from*. */
  const overrides = new Map<string, { base: XYPosition; position: XYPosition }>();
  const sizes = new Map<string, Size>();
  /** Registered handles by node, in registration (DOM) order. */
  const handles = new Map<string, Set<HandleRecord>>();
  const nodeEls = new Map<string, HTMLElement>();
  /** Selected node ids. Uncontrolled: held here, reported through `onSelectionChange`. */
  const selected = new Set<string>();
  let connection: ConnectionState | null = null;
  let stopConnecting: (() => void) | null = null;
  let geometryVersion = 0;

  const viewportListeners = new Set<Listener>();
  const geometryListeners = new Set<Listener>();
  const mountListeners = new Set<Listener>();
  const connectionListeners = new Set<Listener>();
  const nodeListeners = new Map<string, Set<Listener>>();

  let tween: { frame: number; timer: ReturnType<typeof setTimeout> } | null = null;

  const emit = (listeners: Iterable<Listener>) => {
    for (const listener of listeners) listener();
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

  const commitViewport = (next: Viewport) => {
    viewport = next;
    if (viewportEl) viewportEl.style.transform = viewportTransform(next);
    emit(viewportListeners);
  };

  const cancelTween = () => {
    if (!tween) return;
    cancelAnimationFrame(tween.frame);
    clearTimeout(tween.timer);
    tween = null;
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
  const setViewport = (requested: Viewport, options?: SetViewportOptions) => {
    const to = constrain({ ...requested, zoom: clampZoom(requested.zoom) });
    const duration = options?.duration ?? 0;
    target = to;
    cancelTween();

    if (duration <= 0 || document.hidden || prefersReducedMotion()) {
      commitViewport(to);
      return;
    }

    const from = viewport;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1) {
        cancelTween();
        commitViewport(to);
        return;
      }
      const e = easeOutCubic(t);
      commitViewport({
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        zoom: from.zoom + (to.zoom - from.zoom) * e,
      });
      if (tween) tween.frame = requestAnimationFrame(tick);
    };
    tween = {
      frame: requestAnimationFrame(tick),
      timer: setTimeout(() => {
        cancelTween();
        commitViewport(to);
      }, duration + TWEEN_GRACE_MS),
    };
  };

  /** Zooms by `factor`, keeping the point (`cx`, `cy`) — in container pixels — fixed. */
  const zoomAt = (factor: number, cx: number, cy: number, options?: SetViewportOptions) => {
    const zoom = clampZoom(target.zoom * factor);
    if (zoom === target.zoom) return;
    const k = zoom / target.zoom;
    setViewport({ x: cx - (cx - target.x) * k, y: cy - (cy - target.y) * k, zoom }, options);
  };

  const centre = (): XYPosition => ({
    x: (containerEl?.clientWidth ?? 0) / 2,
    y: (containerEl?.clientHeight ?? 0) / 2,
  });

  // --- geometry -------------------------------------------------------------

  const bumpGeometry = () => {
    geometryVersion += 1;
    emit(geometryListeners);
  };

  const resolvePosition = (id: string, fallback: XYPosition): XYPosition => {
    const dragged = overrides.get(id);
    // A drag only stands while the prop position it started from does: if the
    // parent has since laid the node out somewhere new, that layout wins.
    return dragged && samePoint(dragged.base, fallback) ? dragged.position : fallback;
  };

  const getNodeSize = (node: Node): Size =>
    sizes.get(node.id) ?? {
      width: node.width ?? FALLBACK_SIZE.width,
      height: node.height ?? FALLBACK_SIZE.height,
    };

  const setNodePosition = (node: Node, position: XYPosition) => {
    overrides.set(node.id, { base: node.position, position });
    bumpGeometry();
    emit(nodeListeners.get(node.id) ?? []);
  };

  /** Records a measured size. Ignores zero — an unmeasurable node keeps its declared size. */
  const setSize = (id: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const known = sizes.get(id);
    if (known?.width === width && known.height === height) return;
    sizes.set(id, { width, height });
    bumpGeometry();
  };

  /** Lets handle measurement find the node a handle belongs to. Returns its cleanup. */
  const registerNodeElement = (id: string, el: HTMLElement): (() => void) => {
    nodeEls.set(id, el);
    return () => {
      if (nodeEls.get(id) === el) nodeEls.delete(id);
    };
  };

  /** Re-reads where each of a node's handles sits. Bumps geometry only if one moved. */
  const measureHandles = (nodeId: string) => {
    const records = handles.get(nodeId);
    const nodeEl = nodeEls.get(nodeId);
    if (!records || !nodeEl) return;
    let changed = false;
    for (const record of records) {
      const next = anchorOf(record.el, nodeEl);
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

  const setConnection = (next: ConnectionState | null) => {
    connection = next;
    emit(connectionListeners);
  };

  /** Where a registered handle sits in graph space: its measured anchor, else its side's midpoint. */
  const pointOfHandle = (nodeId: string, record: HandleRecord): XYPosition | null => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const at = resolvePosition(nodeId, node.position);
    return record.anchor
      ? { x: at.x + record.anchor.x, y: at.y + record.anchor.y }
      : handleCoordinates(at, record.position, getNodeSize(node));
  };

  const toGraph = (clientX: number, clientY: number): XYPosition => {
    const rect = containerEl?.getBoundingClientRect();
    return {
      x: (clientX - (rect?.left ?? 0) - viewport.x) / viewport.zoom,
      y: (clientY - (rect?.top ?? 0) - viewport.y) / viewport.zoom,
    };
  };

  /**
   * The connectable handle under a screen point. A handle says so with
   * `data-connectable`; browsers also skip `pointer-events: none` in
   * `elementFromPoint`, but this does not lean on that.
   */
  const handleAt = (clientX: number, clientY: number): { nodeId: string; record: HandleRecord } | null => {
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-nodeid][data-handletype][data-connectable]');
    const nodeId = el?.dataset.nodeid;
    if (!el || !nodeId) return null;
    for (const record of handles.get(nodeId) ?? []) if (record.el === el) return { nodeId, record };
    return null;
  };

  /** A source → target connection between two ends, whichever one the drag began at. Null if the types clash. */
  const connectionBetween = (a: Endpoint, b: Endpoint): Connection | null => {
    if (a.type === b.type) return null;
    const [from, to] = a.type === 'source' ? [a, b] : [b, a];
    return { source: from.nodeId, sourceHandle: from.id, target: to.nodeId, targetHandle: to.id };
  };

  const isAllowed = (c: Connection): boolean => callbacks.isValidConnection?.(c) !== false;

  const cancelConnection = () => {
    stopConnecting?.();
    stopConnecting = null;
    if (connection) setConnection(null);
  };

  /** What the line follows: the pointer, or — over a handle that would make a valid connection — that handle. */
  const connectionEnd = (from: Endpoint, startPosition: Position, clientX: number, clientY: number) => {
    const hit = handleAt(clientX, clientY);
    if (hit) {
      const c = connectionBetween(from, { nodeId: hit.nodeId, id: hit.record.id, type: hit.record.type });
      const point = pointOfHandle(hit.nodeId, hit.record);
      if (c && isAllowed(c) && point) return { end: point, endPosition: hit.record.position };
    }
    return { end: toGraph(clientX, clientY), endPosition: OPPOSITE[startPosition] };
  };

  /**
   * Begins dragging a connection out of a handle. The gesture is followed on
   * `window`, so it survives the pointer leaving the handle, the node and the
   * canvas; Escape cancels it. Nothing here edits `edges` — a finished
   * connection is handed to `onConnect` for the caller to add.
   */
  const startConnection = (
    nodeId: string,
    handleEl: HTMLElement,
    at: { clientX: number; clientY: number },
  ) => {
    const record = [...(handles.get(nodeId) ?? [])].find((r) => r.el === handleEl);
    const start = record && pointOfHandle(nodeId, record);
    if (!record || !start) return;
    cancelConnection();

    const from: Endpoint = { nodeId, id: record.id, type: record.type };
    const follow = (clientX: number, clientY: number) => {
      setConnection({
        start,
        startPosition: record.position,
        ...connectionEnd(from, record.position, clientX, clientY),
      });
    };
    follow(at.clientX, at.clientY);

    const onMove = (e: PointerEvent) => { follow(e.clientX, e.clientY); };
    const onUp = (e: PointerEvent) => {
      const hit = handleAt(e.clientX, e.clientY);
      cancelConnection(); // clear first, so a callback sees a settled canvas
      if (!hit) return;
      const c = connectionBetween(from, { nodeId: hit.nodeId, id: hit.record.id, type: hit.record.type });
      if (c && isAllowed(c)) callbacks.onConnect?.(c);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelConnection();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancelConnection);
    window.addEventListener('keydown', onKey);
    stopConnecting = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancelConnection);
      window.removeEventListener('keydown', onKey);
    };
  };

  const isSelected = (id: string): boolean => selected.has(id);

  /** Tells the nodes whose state flipped, and the caller once. */
  const announceSelection = (changed: Iterable<string>) => {
    for (const id of changed) emit(nodeListeners.get(id) ?? []);
    callbacks.onSelectionChange?.({ nodes: nodes.filter((n) => selected.has(n.id)) });
  };

  /**
   * Selects a node — replacing the selection, or with `additive` toggling it in
   * or out. Selecting what is already the whole selection changes nothing, and
   * says nothing.
   */
  const selectNode = (id: string, additive = false) => {
    const before = new Set(selected);
    if (additive) {
      if (!selected.delete(id)) selected.add(id);
    } else {
      selected.clear();
      selected.add(id);
    }
    const changed = [...new Set([...before, ...selected])].filter(
      (n) => before.has(n) !== selected.has(n),
    );
    if (changed.length > 0) announceSelection(changed);
  };

  const clearSelection = () => {
    if (selected.size === 0) return;
    const changed = [...selected];
    selected.clear();
    announceSelection(changed);
  };

  const setNodes = (next: readonly Node[]) => {
    nodes = next;
    const byId = new Map(next.map((n) => [n.id, n]));
    let pruned = false;
    for (const id of [...sizes.keys()]) {
      if (!byId.has(id)) {
        sizes.delete(id);
        pruned = true;
      }
    }
    for (const [id, dragged] of [...overrides]) {
      const node = byId.get(id);
      if (!node || !samePoint(node.position, dragged.base)) {
        overrides.delete(id);
        pruned = true;
      }
    }
    const gone = [...selected].filter((id) => !byId.has(id));
    for (const id of gone) selected.delete(id);
    if (pruned) bumpGeometry();
    if (gone.length > 0) announceSelection(gone);
  };

  const fitView = (options?: SetViewportOptions) => {
    if (!containerEl || nodes.length === 0) return;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (w === 0 || h === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      const pos = resolvePosition(node.id, node.position);
      const size = getNodeSize(node);
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + size.width);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + size.height);
    }

    const zoom = clampZoom(
      Math.min(
        (w - FIT_PADDING * 2) / Math.max(maxX - minX, 1),
        (h - FIT_PADDING * 2) / Math.max(maxY - minY, 1),
      ),
    );
    setViewport(
      { x: w / 2 - ((minX + maxX) / 2) * zoom, y: h / 2 - ((minY + maxY) / 2) * zoom, zoom },
      options,
    );
  };

  // --- lifecycle ------------------------------------------------------------

  const attach = (viewportElement: HTMLElement, container: HTMLElement) => {
    viewportEl = viewportElement;
    containerEl = container;
    // A remount (StrictMode's, or a route change back) gets the viewport it left.
    viewportEl.style.transform = viewportTransform(viewport);
    state = { panZoom: instance, isReady: true };
    emit(mountListeners);
  };

  const detach = () => {
    cancelTween();
    cancelConnection();
    viewportEl = null;
    containerEl = null;
    state = { panZoom: null, isReady: false };
    emit(mountListeners);
  };

  /** Created once. Its identity is the contract: it never changes. */
  const instance: FlowingerInstance = {
    setViewport,
    getViewport: () => viewport,
    zoomIn: (options) => {
      const c = centre();
      zoomAt(ZOOM_STEP, c.x, c.y, options);
    },
    zoomOut: (options) => {
      const c = centre();
      zoomAt(1 / ZOOM_STEP, c.x, c.y, options);
    },
    fitView,
  };

  return {
    instance,
    attach,
    detach,
    zoomAt,
    fitView,
    setBounds: (min: number, max: number, nextExtent: TranslateExtent | null = null) => {
      minZoom = min;
      maxZoom = max;
      const changed = !sameExtent(extent, nextExtent);
      extent = nextExtent;
      // A tighter extent can leave the view outside it: bring it back in.
      if (changed && extent) instance.setViewport(viewport);
    },
    setNodes,
    setCallbacks: (next: NodeCallbacks) => {
      callbacks = next;
    },
    getCallbacks: () => callbacks,

    getViewport: () => viewport,
    getState: () => state,
    getGeometryVersion: () => geometryVersion,

    resolvePosition,
    getNodeSize,
    setNodePosition,
    setSize,
    registerNodeElement,
    registerHandle,
    measureHandles,
    findHandle,
    startConnection,
    getConnection: () => connection,
    subscribeConnection: subscribeTo(connectionListeners),
    isSelected,
    hasSelection: () => selected.size > 0,
    selectNode,
    clearSelection,

    subscribeViewport: subscribeTo(viewportListeners),
    subscribeGeometry: subscribeTo(geometryListeners),
    subscribeMount: subscribeTo(mountListeners),
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
