import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  FlowingerCore,
  FlowingerProvider,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from 'flowinger';
import { items, sharedLink, treeLinks, type PlanLink } from './graph';
import { NODE_HEIGHT, NODE_WIDTH, runLayout, type Algorithm, type Direction, type Positions } from './layout';

/** One plan operator. The handles sit on the sides that face the layout's direction. */
function PlanNode({ data }: NodeProps) {
  const horizontal = data.direction === 'LR';
  return (
    <div className="plan-node">
      <Handle type="target" position={horizontal ? Position.Left : Position.Top} />
      <strong>{String(data.label)}</strong>
      <span>{String(data.detail)}</span>
      <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} />
    </div>
  );
}

// Defined outside the component so they keep their identity between renders.
const nodeTypes = { plan: PlanNode };

const algorithms: { id: Algorithm; label: string }[] = [
  { id: 'd3-hierarchy', label: 'd3-hierarchy' },
  { id: 'dagre', label: 'dagre' },
  { id: 'elk', label: 'ELK' },
];

/**
 * A finished layout, with everything it was computed for. Positions, direction and links change together
 * or not at all: a layout can take a moment (ELK is asynchronous), and drawing new handles over old
 * positions — or framing the old positions — for that moment is a glitch.
 */
interface Laid {
  id: number;
  positions: Positions;
  direction: Direction;
  links: PlanLink[];
}

export function App() {
  const [algorithm, setAlgorithm] = useState<Algorithm>('dagre');
  const [direction, setDirection] = useState<Direction>('TB');
  const [shared, setShared] = useState(false);
  const [laid, setLaid] = useState<Laid | null>(null);
  const [error, setError] = useState<string | null>(null);

  const links = useMemo(() => (shared ? [...treeLinks, sharedLink] : treeLinks), [shared]);
  // A tree layout cannot place a node with two parents; say so instead of throwing.
  const unsupported = algorithm === 'd3-hierarchy' && shared;

  useEffect(() => {
    if (unsupported) return;
    let current = true;
    setError(null);
    runLayout(algorithm, items, links, direction).then(
      (positions) => {
        if (current) setLaid((previous) => ({ id: (previous?.id ?? 0) + 1, positions, direction, links }));
      },
      (e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      current = false;
    };
  }, [algorithm, direction, links, unsupported]);

  const nodes = useMemo<Node[]>(
    () =>
      laid
        ? items.map((item) => ({
            id: item.id,
            type: 'plan',
            position: laid.positions[item.id]!,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            data: { label: item.label, detail: item.detail, direction: laid.direction },
          }))
        : [],
    [laid],
  );

  const edges = useMemo<Edge[]>(
    () =>
      (laid?.links ?? []).map((l) => ({
        id: `${l.source}->${l.target}`,
        source: l.source,
        target: l.target,
        type: 'smoothstep',
        markerEnd: 'arrowclosed',
      })),
    [laid],
  );

  return (
    <div className="app">
      <header>
        <h1>Flowinger layouts</h1>
        <div className="group" role="group" aria-label="Layout library">
          {algorithms.map((a) => (
            <button key={a.id} aria-pressed={algorithm === a.id} onClick={() => setAlgorithm(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="group" role="group" aria-label="Direction">
          <button aria-pressed={direction === 'TB'} onClick={() => setDirection('TB')}>
            Top → bottom
          </button>
          <button aria-pressed={direction === 'LR'} onClick={() => setDirection('LR')}>
            Left → right
          </button>
        </div>
        <label>
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share a scan (a
          DAG)
        </label>
      </header>

      <main>
        {unsupported ? (
          <p className="note">
            d3-hierarchy lays out <em>trees</em>: a node here has two parents. Pick dagre or ELK.
          </p>
        ) : error ? (
          <p className="note">The layout failed: {error}</p>
        ) : laid ? (
          <FlowingerProvider>
            {/* A new layout is a new canvas: `fitView` frames once its nodes have been measured, and a
                remount is the way to ask it to frame again. */}
            <FlowingerCore key={laid.id} nodes={nodes} edges={edges} nodeTypes={nodeTypes} minZoom={0.2} fitView>
              <Background />
            </FlowingerCore>
            <Controls position="bottom-right" />
          </FlowingerProvider>
        ) : null}
      </main>
    </div>
  );
}
