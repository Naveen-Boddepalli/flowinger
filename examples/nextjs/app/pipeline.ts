import { getNodesBounds, viewportForBounds, type Edge, type Node, type Viewport } from 'flowinger';

// Everything in this file runs on the server: the page imports it, and only the result — plain nodes, edges and
// a viewport — goes to the browser. flowinger's geometry helpers are plain functions, so they run here too.

/** The canvas's size, fixed in CSS (`.canvas`), so the server can frame the graph before any browser has measured it. */
export const CANVAS = { width: 960, height: 360 } as const;

const NODE = { width: 150, height: 44 } as const;
const GAP = { x: 70, y: 28 } as const;

// A deploy pipeline: what each step waits for. In an app this comes from a database or an API.
const steps: Record<string, { label: string; after: string[] }> = {
  push: { label: 'Push to main', after: [] },
  install: { label: 'Install', after: ['push'] },
  lint: { label: 'Lint', after: ['install'] },
  types: { label: 'Type check', after: ['install'] },
  test: { label: 'Unit tests', after: ['install'] },
  build: { label: 'Build', after: ['lint', 'types', 'test'] },
  e2e: { label: 'Browser tests', after: ['build'] },
  preview: { label: 'Preview deploy', after: ['build'] },
  release: { label: 'Release', after: ['e2e', 'preview'] },
};

/**
 * A layered layout with no dependency: each step's column is the longest chain of steps before it, and each
 * column is centred. For anything bigger, use dagre or elkjs — `examples/layouts` shows both — the same way.
 */
function layout(): Node[] {
  const column = new Map<string, number>();
  const columnOf = (id: string): number => {
    const known = column.get(id);
    if (known !== undefined) return known;
    const at = Math.max(-1, ...steps[id].after.map(columnOf)) + 1;
    column.set(id, at);
    return at;
  };
  const columns: string[][] = [];
  for (const id of Object.keys(steps)) (columns[columnOf(id)] ??= []).push(id);

  const tallest = Math.max(...columns.map((ids) => ids.length));
  return columns.flatMap((ids, c) => {
    const offset = ((tallest - ids.length) * (NODE.height + GAP.y)) / 2;
    return ids.map((id, r) => ({
      id,
      type: 'step',
      position: { x: c * (NODE.width + GAP.x), y: offset + r * (NODE.height + GAP.y) },
      // Declared, so edges are drawn right in the server's HTML, before anything is measured.
      width: NODE.width,
      height: NODE.height,
      data: { label: steps[id].label },
    }));
  });
}

/**
 * What `fitView` will do in the browser — the same function, with its defaults (zoom 0.05–2, a 40 px margin) —
 * done here so the first paint is already framed. Where the canvas is the size expected, the browser's fit
 * lands exactly here and nothing moves; where it is not (a phone), `fitView` frames it again once measured.
 */
function frame(nodes: Node[]): Viewport {
  return viewportForBounds(getNodesBounds(nodes), CANVAS.width, CANVAS.height, 0.05, 2);
}

export function pipeline(): { nodes: Node[]; edges: Edge[]; viewport: Viewport } {
  const nodes = layout();
  const edges: Edge[] = Object.entries(steps).flatMap(([id, step]) =>
    step.after.map((from) => ({ id: `${from}-${id}`, source: from, target: id, markerEnd: 'arrowclosed' })),
  );
  return { nodes, edges, viewport: frame(nodes) };
}
