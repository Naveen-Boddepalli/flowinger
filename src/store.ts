import type {
  FlowingerInstance,
  Node,
  SetViewportOptions,
  Viewport,
  XYPosition,
} from './types.ts';

type Listener = () => void;

export interface Size {
  width: number;
  height: number;
}

/** What `useStore` selects from — the subset of React Flow's store shape that migrating code reads. */
export interface FlowingerState {
  /** Null until a canvas has mounted: viewport calls are meaningless before then. */
  panZoom: FlowingerInstance | null;
  isReady: boolean;
}

export interface NodeCallbacks {
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

  let viewportEl: HTMLElement | null = null;
  let containerEl: HTMLElement | null = null;
  let state: FlowingerState = { panZoom: null, isReady: false };

  let nodes: readonly Node[] = [];
  let callbacks: NodeCallbacks = {};
  /** A dragged position, remembered with the prop position it was dragged *from*. */
  const overrides = new Map<string, { base: XYPosition; position: XYPosition }>();
  const sizes = new Map<string, Size>();
  let geometryVersion = 0;

  const viewportListeners = new Set<Listener>();
  const geometryListeners = new Set<Listener>();
  const mountListeners = new Set<Listener>();
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
    const to: Viewport = { ...requested, zoom: clampZoom(requested.zoom) };
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
    if (pruned) bumpGeometry();
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
    setBounds: (min: number, max: number) => {
      minZoom = min;
      maxZoom = max;
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
