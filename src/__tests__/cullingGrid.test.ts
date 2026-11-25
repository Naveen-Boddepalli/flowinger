import { describe, expect, it } from 'vitest';
import { cullingFeature } from '../features/culling.ts';
import { selectionFeature } from '../features/selection.ts';
import { DEFAULT_ENGINE_OPTIONS, createFlowingerStore } from '../store.ts';
import type { Feature } from '../features.ts';
import { isRectIntersecting } from '../geometry.ts';
import type { Edge, Node, Rect } from '../types.ts';

// A pass that runs asks the grid what is near the region instead of asking every node. The grid is made once and
// kept in step with what moves, so after any edits a pass must find exactly what asking every node would: each
// check here jumps the view far away and back, which runs a whole pass, and compares it with a scan of everything.

type Ctx = Parameters<NonNullable<Feature['install']>>[0];
const PANE = { width: 800, height: 600 };

function seeded(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

function culledStore(nodes: Node[], edges: Edge[]) {
  const store = createFlowingerStore();
  let ctx: Ctx | null = null;
  store.use([cullingFeature, selectionFeature, { name: 'probe', install: (c) => ((ctx = c), {}) }]);
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: PANE.width });
  Object.defineProperty(container, 'clientHeight', { value: PANE.height });
  store.attach(document.createElement('div'), container);
  store.setOptions({ ...DEFAULT_ENGINE_OPTIONS, elementsSelectable: true, onlyRenderVisibleElements: true });
  store.setNodes(nodes);
  store.setEdges(edges);
  return { store, ctx: ctx as unknown as Ctx };
}

/** What asking every node and edge draws for the region round `viewport`. */
function scan(ctx: Ctx, viewport: { x: number; y: number; zoom: number }) {
  const { zoom } = viewport;
  const w = PANE.width / zoom;
  const h = PANE.height / zoom;
  const region: Rect = { x: -viewport.x / zoom - w / 4, y: -viewport.y / zoom - h / 4, width: w * 1.5, height: h * 1.5 };
  const box = (n: Node): Rect => ({ ...ctx.absolutePosition(n), ...ctx.getNodeSize(n) });
  const nodes = ctx.nodes
    .filter(
      (n) =>
        n.hidden !== true &&
        (ctx.isSelected(n.id) || ctx.draggingIds.has(n.id) || isRectIntersecting(box(n), region, true)),
    )
    .map((n) => n.id);
  const drawn = new Set(nodes);
  const edges = ctx.edges
    .filter((e) => {
      if (e.hidden === true) return false;
      if (drawn.has(e.source) || drawn.has(e.target)) return true;
      const a = ctx.nodeById.get(e.source);
      const b = ctx.nodeById.get(e.target);
      if (!a || !b) return false;
      const ra = box(a);
      const rb = box(b);
      const x = Math.min(ra.x, rb.x);
      const y = Math.min(ra.y, rb.y);
      const span = {
        x,
        y,
        width: Math.max(ra.x + ra.width, rb.x + rb.width) - x,
        height: Math.max(ra.y + ra.height, rb.y + rb.height) - y,
      };
      return isRectIntersecting(span, region, true);
    })
    .map((e) => e.id);
  return { nodes: nodes.sort(), edges };
}

describe('the culling grid', () => {
  it('asks only about the nodes near the view, once a pass has run with nothing changed since', () => {
    // A node counts as asked about when a pass reads whether it is hidden.
    let asked = 0;
    const nodes: Node[] = Array.from({ length: 2500 }, (_, i) => {
      const n: Node = { id: `n${String(i)}`, position: { x: (i % 50) * 200, y: Math.floor(i / 50) * 120 }, width: 150, height: 40, data: {} };
      Object.defineProperty(n, 'hidden', { get: () => (asked++, undefined), enumerable: false });
      return n;
    });
    // The first pass over a list asks every node: the list may be about to change again.
    const { store } = culledStore(nodes, []);
    expect(asked).toBeGreaterThanOrEqual(2500);
    const jump = (x: number, y: number) => {
      asked = 0;
      void store.instance.setViewport({ x: -x, y: -y, zoom: 1 });
      return asked;
    };
    // The next is asked of the grid: the few dozen nodes in and round the view, not 2,500.
    const near = jump(5000, 3000);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(200);
    expect(store.getVisible()?.nodes.size).toBeGreaterThan(20);
    // A selection and a drag's end name their nodes: the grid is kept.
    store.api(selectionFeature).selectNode('n7');
    expect(jump(6000, 4000)).toBeLessThan(200);
    // The same nodes in a new array are the same: kept. A node more is a new list, and starts from every node.
    store.setNodes([...nodes]);
    expect(jump(2000, 2000)).toBeLessThan(200);
    asked = 0;
    store.setNodes([...nodes, { id: 'more', position: { x: 0, y: 0 }, data: {} }]);
    expect(asked + jump(3000, 2000)).toBeGreaterThanOrEqual(2500);
    expect(jump(4000, 2000)).toBeLessThan(200);
  });


  it.each([11, 12, 13])('finds what a scan of every node finds, after random edits (seed %i)', (seed) => {
    const random = seeded(seed);
    // A field of small nodes, a few huge ones (a group: wider than the grid keeps in cells), and children that
    // move with their parents.
    let nodes: Node[] = Array.from({ length: 400 }, (_, i) => {
      const huge = i % 97 === 0;
      return {
        id: `n${String(i)}`,
        position: { x: random(20000) - 10000, y: random(12000) - 6000 },
        width: huge ? 6000 : 80 + random(120),
        height: huge ? 4000 : 30 + random(60),
        data: {},
        ...(i % 9 === 8 ? { parentId: `n${String(i - 8)}`, position: { x: random(300), y: random(200) } } : {}),
      };
    });
    // Short edges and long ones, across the whole field.
    let edges: Edge[] = Array.from({ length: 500 }, (_, i) => {
      const a = random(400);
      const b = i % 5 === 0 ? random(400) : Math.min(399, a + 1 + random(3));
      return { id: `e${String(i)}`, source: `n${String(a)}`, target: `n${String(b)}` };
    });
    const { store, ctx } = culledStore(nodes, edges);
    const pick = () => nodes[random(nodes.length)] as Node;
    let checks = 0;

    for (let step = 0; step < 400; step++) {
      const op = random(10);
      const target = pick();
      if (op <= 1) {
        // Moved by the props: a parent takes its children along.
        nodes = nodes.map((n) =>
          n.id === target.id ? { ...n, position: { x: random(20000) - 10000, y: random(12000) - 6000 } } : n,
        );
        store.setNodes(nodes);
      } else if (op === 2) {
        ctx.setNodePosition(target, { x: random(20000) - 10000, y: random(12000) - 6000 });
      } else if (op === 3) {
        store.setSize(target.id, 40 + random(400), 20 + random(300));
      } else if (op === 4) {
        store.api(selectionFeature).selectNode(target.id, random(2) === 0);
      } else if (op === 5) {
        nodes = nodes.map((n) => (n.id === target.id ? { ...n, hidden: n.hidden !== true } : n));
        store.setNodes(nodes);
      } else if (op === 6) {
        // Picked up or let go: one being dragged is drawn wherever it is.
        if (ctx.draggingIds.has(target.id)) ctx.draggingIds.delete(target.id);
        else ctx.draggingIds.add(target.id);
        ctx.changed();
      } else if (op === 7) {
        const i = random(edges.length);
        const target2 = `n${String(random(400))}`;
        edges = edges.map((e, k) => (k === i ? { ...e, target: target2, hidden: random(4) === 0 } : e));
        store.setEdges(edges);
      } else if (op === 8) {
        // A pan within the region: nothing is asked, but the grid must still follow what moves meanwhile.
        const v = store.getViewport();
        void store.instance.setViewport({ ...v, x: v.x - 20 });
      } else {
        // A check: far away, then somewhere in the field — each a whole pass.
        void store.instance.setViewport({ x: -1e7, y: -1e7, zoom: 1 });
        const zoom = [0.1, 0.5, 1, 2][random(4)] as number;
        const viewport = { x: -(random(20000) - 10000) * zoom, y: -(random(12000) - 6000) * zoom, zoom };
        void store.instance.setViewport(viewport);
        const got = store.getVisible();
        expect(got).not.toBeNull();
        const want = scan(ctx, viewport);
        const label = `step ${String(step)}`;
        expect([...(got?.nodes ?? [])].sort(), label).toEqual(want.nodes);
        expect([...(got?.edges ?? [])], label).toEqual(want.edges);
        checks++;
      }
    }
    expect(checks).toBeGreaterThan(20);
  });
});
