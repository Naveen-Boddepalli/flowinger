import { useSyncExternalStore } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  FlowingerCore,
  Handle,
  Position,
  FlowingerProvider,
  MarkerType,
  selectionFeature,
  stackingFeature,
  type Edge,
  type EdgeProps,
  type Feature,
  type Node,
} from '../index.ts';
import { useFlowingerStore } from '../context.ts';
import type { FlowingerStore } from '../store.ts';
import type { SelectionApi } from '../features/selection.ts';

// The edge layer keeps each edge as it last drew it, and draws again only the edges whose inputs changed. The
// oracle is the same canvas with the keeping switched off: a feature that stacks edges makes the layer draw every
// edge afresh. After each random edit the two must draw the same edges.

/** Changes nothing about stacking, and so makes the edge layer draw every edge each time. */
const drawAfresh: Feature = { name: 'drawAfresh', stackEdge: (_store, _edge, level) => level };

function Grab({ into }: { into: (s: FlowingerStore) => void }) {
  into(useFlowingerStore());
  return null;
}

function Custom({ sourceX, sourceY, targetX, targetY, selected, label }: EdgeProps) {
  const d = `M${String(sourceX)},${String(sourceY)}L${String(targetX)},${String(targetY)}`;
  return <path className="custom" d={d} data-sel={String(selected)} data-label={String(label)} />;
}
const edgeTypes = { custom: Custom };

// A node whose handles move while the node itself does not change: only the store's record of them says so.
const sides = new Map<string, Position>();
const listeners = new Set<() => void>();
const flipSide = (id: string) => {
  sides.set(id, sides.get(id) === Position.Left ? Position.Right : Position.Left);
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function Flip({ id }: { id: string }) {
  const side = useSyncExternalStore(subscribe, () => sides.get(id) ?? Position.Left);
  return (
    <div>
      <Handle type="target" position={side === Position.Left ? Position.Right : Position.Left} />
      {id}
      <Handle type="source" position={side} />
    </div>
  );
}
const nodeTypes = { flip: Flip };

interface Props {
  nodes: Node[];
  edges: Edge[];
  defaultMarkerColor?: string;
  elevateEdgesOnSelect: boolean;
  nodeOrigin?: [number, number];
}

function Canvas({ props, features, into }: { props: Props; features: Feature[]; into: (s: FlowingerStore) => void }) {
  return (
    <div style={{ width: 800, height: 600 }}>
      <FlowingerProvider>
        <Grab into={into} />
        <FlowingerCore
          {...props}
          edgeTypes={edgeTypes}
          nodeTypes={nodeTypes}
          elementsSelectable
          features={features}
        />
      </FlowingerProvider>
    </div>
  );
}

/** What an edge layer draws, with each arrowhead named by what it looks like rather than by its id. */
function drawn(root: HTMLElement): string {
  const defs = new Map<string, string>();
  for (const m of root.querySelectorAll('marker')) {
    const clone = m.cloneNode(true) as Element;
    clone.removeAttribute('id');
    defs.set(m.id, clone.outerHTML);
  }
  const named = (s: string) => s.replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(${defs.get(id) ?? `missing ${id}`})`);
  const out: string[] = [];
  for (const svg of root.querySelectorAll('svg.flowinger-edges')) {
    out.push(`layer ${svg.getAttribute('style') ?? ''}`);
    for (const g of svg.querySelectorAll('[data-testid^="rf__edge-"]')) out.push(named(g.outerHTML));
  }
  // Every arrowhead an edge refers to is defined; the set defined is the set referred to.
  out.push(`defs ${[...new Set(defs.values())].sort().join('')}`);
  return out.join('\n');
}

/** A small, seeded generator, so a failure can be replayed. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MARKERS = [undefined, MarkerType.Arrow, MarkerType.ArrowClosed, { type: MarkerType.Arrow, color: '#f0a' }];
const TYPES = [undefined, 'default', 'input', 'output', 'flip'];
const EDGE_TYPES = [undefined, 'custom'];

describe('the edge layer, keeping what it drew', () => {
  it.each([1, 2, 3])('draws what a layer that keeps nothing draws, after each of 250 random edits (seed %i)', (seed) => {
    sides.clear();
    const rnd = random(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    let props: Props = {
      nodes: ids.map((id, i) => ({
        id,
        position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 150 },
        // Half are sized by their props, half by what the store is told was measured.
        ...(i % 2 === 0 ? { width: 100, height: 40 } : {}),
        ...(i % 3 === 0 ? { type: 'flip' } : {}),
        data: { label: id },
      })),
      edges: Array.from({ length: 12 }, (_, i) => ({
        id: `e${String(i)}`,
        source: ids[i % ids.length] as string,
        target: ids[(i * 3 + 1) % ids.length] as string,
        markerEnd: MARKERS[i % MARKERS.length],
      })),
      elevateEdgesOnSelect: false,
    };

    const stores: FlowingerStore[] = [];
    const keeping = [selectionFeature, stackingFeature];
    const afresh = [selectionFeature, stackingFeature, drawAfresh];
    const view = (p: Props) => (
      <>
        <div data-canvas="keeping">
          <Canvas props={p} features={keeping} into={(s) => (stores[0] = s)} />
        </div>
        <div data-canvas="afresh">
          <Canvas props={p} features={afresh} into={(s) => (stores[1] = s)} />
        </div>
      </>
    );
    const { container, rerender } = render(view(props));
    const one = container.querySelector<HTMLElement>('[data-canvas="keeping"]');
    const other = container.querySelector<HTMLElement>('[data-canvas="afresh"]');
    if (!one || !other) throw new Error('no canvases');
    const both = (fn: (s: FlowingerStore) => void) => act(() => stores.forEach(fn));
    for (const id of ids.filter((_, i) => i % 2 === 1)) both((s) => s.setSize(id, 120, 50));

    const edits: (() => string)[] = [
      () => {
        const id = pick(ids);
        const x = Math.round(rnd() * 800);
        const y = Math.round(rnd() * 600);
        props = { ...props, nodes: props.nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)) };
        return `move ${id} by props`;
      },
      () => {
        const node = pick(props.nodes);
        const position = { x: Math.round(rnd() * 800), y: Math.round(rnd() * 600) };
        both((s) => s.setNodePosition(node, position));
        return `drag ${node.id}`;
      },
      () => {
        const id = pick(ids);
        const w = 60 + Math.round(rnd() * 100);
        const h = 30 + Math.round(rnd() * 40);
        both((s) => s.setSize(id, w, h));
        return `size ${id}`;
      },
      () => {
        const id = pick(ids);
        const type = pick(TYPES);
        props = { ...props, nodes: props.nodes.map((n) => (n.id === id ? { ...n, type } : n)) };
        return `type ${id} ${String(type)}`;
      },
      () => {
        const id = pick(ids);
        const additive = rnd() < 0.5;
        both((s) => (s.apiOf('selection') as SelectionApi).selectNode(id, additive));
        return `select node ${id}`;
      },
      () => {
        const id = pick(props.edges).id;
        const additive = rnd() < 0.5;
        both((s) => (s.apiOf('selection') as SelectionApi).selectEdge(id, additive));
        return `select edge ${id}`;
      },
      () => {
        both((s) => (s.apiOf('selection') as SelectionApi).clearSelection());
        return 'clear selection';
      },
      () => {
        const id = pick(props.edges).id;
        const markerEnd = pick(MARKERS);
        const type = pick(EDGE_TYPES);
        const label = rnd() < 0.5 ? undefined : `l${String(Math.floor(rnd() * 3))}`;
        props = { ...props, edges: props.edges.map((e) => (e.id === id ? { ...e, markerEnd, type, label } : e)) };
        return `edit ${id}`;
      },
      () => {
        const id = pick(props.edges).id;
        const source = pick(ids);
        props = { ...props, edges: props.edges.map((e) => (e.id === id ? { ...e, source } : e)) };
        return `rewire ${id} from ${source}`;
      },
      () => {
        props = { ...props, defaultMarkerColor: pick([undefined, '#333', '#0a0']) };
        return 'marker colour';
      },
      () => {
        props = { ...props, elevateEdgesOnSelect: !props.elevateEdgesOnSelect };
        return 'elevate edges';
      },
      () => {
        // A node drawn by `Flip`, if there is one: its handles change sides and nothing else does.
        const id = pick(props.nodes.filter((n) => n.type === 'flip').map((n) => n.id).concat(ids.slice(0, 1)));
        const before = drawn(other);
        act(() => flipSide(id));
        if (drawn(other) !== before) flipsThatMoved += 1;
        return `flip ${id}'s handles`;
      },
      () => {
        props = { ...props, nodeOrigin: pick([undefined, [0.5, 0.5], [1, 0]] as const) as Props['nodeOrigin'] };
        return 'node origin';
      },
      () => {
        const id = pick(ids);
        const zIndex = rnd() < 0.5 ? undefined : Math.floor(rnd() * 5);
        props = { ...props, nodes: props.nodes.map((n) => (n.id === id ? { ...n, zIndex } : n)) };
        return `z ${id}`;
      },
    ];

    let flipsThatMoved = 0;
    const log: string[] = [];
    for (let step = 0; step < 250; step++) {
      log.push(pick(edits)());
      rerender(view(props));
      const kept = drawn(one);
      const fresh = drawn(other);
      if (kept !== fresh) {
        expect({ after: log.slice(-8), kept }).toEqual({ after: log.slice(-8), kept: fresh });
      }
    }
    // The run drew something worth comparing: edges with arrowheads, and handles that moved an edge.
    expect(flipsThatMoved).toBeGreaterThan(0);
    const last = drawn(one);
    expect(last).toContain('rf__edge-');
    expect(last).toContain('<marker');
  });
});
