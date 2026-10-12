import { useId, useSyncExternalStore, type CSSProperties, type FocusEvent as ReactFocusEvent } from 'react';
import { useFlowingerStore } from '../context.ts';
import type { Feature } from '../features.ts';
import type { AriaLabelConfig } from '../types.ts';

/** What assistive technology is told, in English; `ariaLabelConfig` replaces any of it. */
const DEFAULTS = {
  'node.a11yDescription.default':
    'Press enter or space to select a node. Press delete to remove it and escape to cancel.',
  'node.a11yDescription.keyboardDisabled':
    'Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }: { direction: string; x: number; y: number }) =>
    `Moved selected node ${direction}. New position, x: ${String(x)}, y: ${String(y)}`,
  'edge.a11yDescription.default':
    'Press enter or space to select an edge. You can then press delete to remove it or escape to cancel.',
};

/** Read by screen readers and nothing else: on the page, and out of sight. */
const HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  border: 0,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0px, 0px, 0px, 0px)',
  clipPath: 'inset(100%)',
};

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export interface A11yApi {
  readonly config: {
    nodesFocusable: boolean | undefined;
    disabled: boolean;
    panOnFocus: boolean;
    /** Ids for the descriptions nodes and edges point at, unique to this canvas. */
    id: string;
    labels: AriaLabelConfig;
  };
  subscribe: (listener: () => void) => () => void;
  getMessage: () => string;
  say: (message: string) => void;
}

/** The description every focusable node and edge points at, and the region that announces keyboard moves. */
function Descriptions() {
  const store = useFlowingerStore();
  const a = store.api(a11yFeature);
  const message = useSyncExternalStore(a.subscribe, a.getMessage, () => '');
  const { id, disabled, labels } = a.config;
  return (
    <>
      <div id={`${id}-node-desc`} style={HIDDEN}>
        {disabled
          ? (labels['node.a11yDescription.default'] ?? DEFAULTS['node.a11yDescription.default'])
          : (labels['node.a11yDescription.keyboardDisabled'] ?? DEFAULTS['node.a11yDescription.keyboardDisabled'])}
      </div>
      <div id={`${id}-edge-desc`} style={HIDDEN}>
        {labels['edge.a11yDescription.default'] ?? DEFAULTS['edge.a11yDescription.default']}
      </div>
      {!disabled && (
        <div aria-live="assertive" aria-atomic="true" style={HIDDEN}>
          {message}
        </div>
      )}
    </>
  );
}

/**
 * Keyboard and screen-reader behaviour: which nodes and edges are tab stops (`nodesFocusable`, a node's or
 * edge's own `focusable`, `disableKeyboardA11y`), what they are described as and the live announcement of a
 * move made with the arrow keys (`ariaLabelConfig`), and panning to a node that takes focus out of view
 * (`autoPanOnNodeFocus`). Put it before `dragFeature`: the announcement is of where the node was.
 */
export const a11yFeature: Feature<A11yApi> = {
  name: 'a11y',
  install() {
    let message = '';
    const listeners = new Set<() => void>();
    return {
      config: { nodesFocusable: undefined, disabled: false, panOnFocus: true, id: 'flowinger', labels: {} },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getMessage: () => message,
      say: (next) => {
        message = next;
        for (const fn of listeners) fn();
      },
    };
  },

  useCanvas({ store, props }) {
    const { config } = store.api(a11yFeature);
    // Unique per canvas, and the same on the server and the client.
    config.id = `flowinger-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
    config.nodesFocusable = props.nodesFocusable;
    config.disabled = props.disableKeyboardA11y === true;
    config.panOnFocus = props.autoPanOnNodeFocus ?? true;
    config.labels = props.ariaLabelConfig ?? {};
    // What the controls, the minimap and a handle read.
    for (const key of Object.keys(store.labels)) Reflect.deleteProperty(store.labels, key);
    for (const [key, value] of Object.entries(config.labels)) {
      if (typeof value === 'string') store.labels[key] = value;
    }
    return undefined;
  },

  useNode({ store, node, selectable, selected, draggable }) {
    const { config, say } = store.api(a11yFeature);
    // What is said outright overrides the others (selecting makes a node a tab stop): `false` takes it out.
    const explicit = config.disabled ? false : (node.focusable ?? config.nodesFocusable);
    const focusable = explicit ?? selectable;
    const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
      if (config.disabled || !config.panOnFocus) return;
      // Focus from the keyboard, not from a click.
      try {
        if (e.currentTarget.matches(':focus') && !e.currentTarget.matches(':focus-visible')) return;
      } catch {
        // No such selector here: treat it as the keyboard.
      }
      const rect = store.getAbsoluteRect(node.id);
      const size = store.getContainerSize();
      const view = store.getViewport();
      if (!rect || !size) return;
      const left = -view.x / view.zoom;
      const top = -view.y / view.zoom;
      const inView =
        rect.x < left + size.width / view.zoom &&
        rect.x + rect.width > left &&
        rect.y < top + size.height / view.zoom &&
        rect.y + rect.height > top;
      if (!inView) {
        void store.instance.setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, { zoom: view.zoom });
      }
    };
    return {
      ...(explicit === undefined ? {} : { focusable: explicit }),
      props: {
        ...(focusable ? { 'aria-describedby': `${config.id}-node-desc` } : {}),
        onFocus,
      },
      // Said before the move is made — where the node was, as React Flow's own message does.
      onKeyDown: (e) => {
        if (config.disabled || !ARROWS.has(e.key) || !selected || !draggable) return;
        const at = store.absolutePosition(node);
        const make =
          config.labels['node.a11yDescription.ariaLiveMessage'] ?? DEFAULTS['node.a11yDescription.ariaLiveMessage'];
        say(make({ direction: e.key.replace('Arrow', '').toLowerCase(), x: Math.trunc(at.x), y: Math.trunc(at.y) }));
      },
    };
  },

  useEdge({ store }) {
    const { config } = store.api(a11yFeature);
    return { props: { 'aria-describedby': `${config.id}-edge-desc` } };
  },

  Layer: Descriptions,
};
