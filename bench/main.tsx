// One page, either library, the same graph: what `scripts/bench.mjs` drives in a real browser.
//
//   ?lib=flowinger|reactflow   which canvas
//   &n=1000                    how many nodes (a grid, each joined to the next in its row)
//   &cull=0|1                  onlyRenderVisibleElements
//
// The page does nothing until `window.__bench.mount()` is called, so a run is timed from a clean page.
import '@xyflow/react/dist/style.css';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useMemo } from 'react';
import * as Flowinger from '../src/index.ts';
import * as ReactFlowLib from '@xyflow/react';

/** What the page needs of either: the two have the same names, and not the same types. */
interface Lib {
  useNodesState: (initial: unknown[]) => [unknown[], unknown, (changes: unknown[]) => void];
  useEdgesState: (initial: unknown[]) => [unknown[], unknown, (changes: unknown[]) => void];
  Handle: React.ComponentType<{ type: 'source' | 'target'; position: unknown }>;
  Position: { Left: unknown; Right: unknown };
  ReactFlow: React.ComponentType<Record<string, unknown>>;
}

const params = new URLSearchParams(window.location.search);
const libName = params.get('lib') === 'reactflow' ? 'reactflow' : 'flowinger';
const count = Number(params.get('n') ?? 1000);
const cull = params.get('cull') === '1';

interface Graph {
  nodes: { id: string; type: string; position: { x: number; y: number }; data: { label: string } }[];
  edges: { id: string; source: string; target: string }[];
}

function makeGraph(n: number): Graph {
  const cols = Math.ceil(Math.sqrt(n));
  const nodes: Graph['nodes'] = [];
  const edges: Graph['edges'] = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      id: `n${String(i)}`,
      type: 'bench',
      position: { x: (i % cols) * 180, y: Math.floor(i / cols) * 60 },
      data: { label: `Node ${String(i)}` },
    });
    if (i % cols < cols - 1 && i + 1 < n) edges.push({ id: `e${String(i)}`, source: `n${String(i)}`, target: `n${String(i + 1)}` });
  }
  return { nodes, edges };
}

function Bench({ lib }: { lib: Lib }) {
  const graph = useMemo(() => makeGraph(count), []);
  const [nodes, , onNodesChange] = lib.useNodesState(graph.nodes);
  const [edges, , onEdgesChange] = lib.useEdgesState(graph.edges);
  const { Handle, Position } = lib;
  const BenchNode = useMemo(
    () =>
      function BenchNode({ data }: { data: { label: string } }) {
        return (
          <div className="bench-node">
            <Handle type="target" position={Position.Left} />
            {data.label}
            <Handle type="source" position={Position.Right} />
          </div>
        );
      },
    [Handle, Position],
  );
  const nodeTypes = useMemo(() => ({ bench: BenchNode }), [BenchNode]);
  const Canvas = lib.ReactFlow;
  return (
    <Canvas
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onlyRenderVisibleElements={cull}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll
      minZoom={0.05}
      maxZoom={2}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      proOptions={{ hideAttribution: true }}
    />
  );
}

const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const nodeCount = () => document.querySelectorAll('.react-flow__node').length;

/**
 * Waits until the document has held still — the same number of elements — for `still` frames, and says when it
 * last changed: that is when the graph was on the screen, where the frames spent making sure of it are not.
 */
async function settle(still = 5, limitMs = 120_000): Promise<number> {
  const t0 = performance.now();
  let last = -1;
  let held = 0;
  let changedAt = t0;
  while (held < still) {
    await frame();
    // When it was seen, not the frame's own timestamp — which is when the frame began, before the render's.
    const seen = performance.now();
    const size = document.getElementsByTagName('*').length;
    if (size !== last || nodeCount() === 0) {
      held = 0;
      changedAt = seen;
    } else held += 1;
    last = size;
    if (performance.now() - t0 > limitMs) throw new Error('did not settle');
  }
  return changedAt;
}

interface FrameStats {
  frames: number;
  p50: number;
  p95: number;
  /** Frames that took longer than 25 ms — at 60 Hz, one the browser had to drop. */
  dropped: number;
  /** The viewport's transform before and after: a run that did not move the view measured nothing. */
  moved: boolean;
  scaled: boolean;
}

function stats(deltas: number[], moved = true, scaled = true): FrameStats {
  const sorted = [...deltas].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    frames: deltas.length,
    p50: at(0.5),
    p95: at(0.95),
    dropped: deltas.filter((d) => d > 25).length,
    moved,
    scaled,
  };
}

/** The viewport's translate and scale, from its transform. */
function transform(): { x: number; y: number; k: number } {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement;
  const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(el.style.transform);
  return m ? { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) } : { x: 0, y: 0, k: 1 };
}

/**
 * `frames` frames, each with one wheel event, sent to whatever is under the middle of the canvas (React
 * Flow listens on an inner pane, not the outer element); what each frame took.
 */
async function wheelRun(frames: number, make: (i: number) => WheelEventInit): Promise<FrameStats> {
  const el = document.querySelector('.react-flow') as HTMLElement;
  const rect = el.getBoundingClientRect();
  const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  const target = document.elementFromPoint(at.clientX, at.clientY) ?? el;
  const before = transform();
  let moved = false;
  let scaled = false;
  const deltas: number[] = [];
  let last = await frame();
  for (let i = 0; i < frames; i++) {
    target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...at, ...make(i) }));
    const now = await frame();
    deltas.push(now - last);
    last = now;
    // Any frame will do: a zoom that goes in and comes back ends where it began.
    const t = transform();
    if (t.x !== before.x || t.y !== before.y) moved = true;
    if (t.k !== before.k) scaled = true;
  }
  return stats(deltas, moved, scaled);
}

/** A recorder of frame deltas, for a drag driven from outside. */
let recording: { deltas: number[]; on: boolean; last: number } | null = null;

declare global {
  interface Window {
    __bench: unknown;
  }
}

window.__bench = {
  lib: libName,
  count,
  cull,

  async mount(): Promise<{ mountMs: number; nodesInDom: number; domElements: number }> {
    const lib = (libName === 'reactflow' ? ReactFlowLib : Flowinger) as unknown as Lib;
    const root = createRoot(document.getElementById('app') as HTMLElement);
    const t0 = performance.now();
    flushSync(() => {
      root.render(<Bench lib={lib} />);
    });
    const changedAt = await settle();
    return {
      // Until the document last changed — and the frame that showed it.
      mountMs: changedAt - t0,
      nodesInDom: nodeCount(),
      domElements: document.getElementsByTagName('*').length,
    };
  },

  /** The wheel pans: 150 frames, each moving the view. */
  pan: () => wheelRun(150, (i) => ({ deltaX: i % 2 === 0 ? 24 : -8, deltaY: 12 })),

  /** Control + wheel zooms (a pinch): 150 frames, in and out. */
  zoom: () => wheelRun(150, (i) => ({ ctrlKey: true, deltaY: i % 2 === 0 ? 6 : -6 })),

  /** Where the middle of the first node is, for a drag. */
  where(id: string): { x: number; y: number } | null {
    const el = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },

  recordStart(): void {
    const r = { deltas: [] as number[], on: true, last: performance.now() };
    recording = r;
    const tick = (now: number) => {
      if (!r.on) return;
      r.deltas.push(now - r.last);
      r.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  recordStop(): FrameStats {
    const r = recording;
    if (!r) throw new Error('not recording');
    r.on = false;
    recording = null;
    return stats(r.deltas.slice(1));
  },
};
