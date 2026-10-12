import { createContext, useContext, useMemo } from 'react';
import {
  Background,
  Controls,
  FlowingerCore,
  FlowingerProvider,
  Handle,
  Position,
  editingFeature,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from 'flowinger';
import { useCollapsibleTree } from 'flowinger/tree';
import { people } from './people';
import { NODE_HEIGHT, NODE_WIDTH, layoutShown } from './layout';

// --- the graph, once ---------------------------------------------------------------------------------------

const everyone = layoutShown(people);

/** Every node, placed as if nothing were collapsed. What is shown is laid out again from this, below. */
const initialNodes: Node[] = people.map((p) => ({
  id: p.id,
  type: 'person',
  position: everyone[p.id]!,
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
  data: { name: p.name, role: p.role },
  // Not draggable: a position here is the layout's, and is worked out again whenever a branch opens or closes.
  draggable: false,
}));

/** `source` is the manager. `useCollapsibleTree` follows edges from source to target — down the tree. */
const initialEdges: Edge[] = people.flatMap((p) =>
  p.manager === null ? [] : [{ id: `${p.manager}->${p.id}`, source: p.manager, target: p.id, type: 'smoothstep' }],
);

const executives = people.filter((p) => p.manager === 'ceo').map((p) => p.id);

// --- the nodes ---------------------------------------------------------------------------------------------

/**
 * What a node needs of the tree, handed down by context: a node component is not rendered by this one, so
 * props are not a way to reach it, and `useCollapsibleTree` has to be called in one place — each call has
 * state of its own.
 */
interface Branches {
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  /** How many people are under this one, however deep — null for someone with nobody under them. */
  below: (id: string) => number | null;
}
const BranchesContext = createContext<Branches | null>(null);

function PersonNode({ id, data }: NodeProps) {
  const branches = useContext(BranchesContext);
  const below = branches?.below(id) ?? null;
  const collapsed = branches?.isCollapsed(id) ?? false;
  return (
    <div className="person">
      <Handle type="target" position={Position.Left} />
      <strong>{String(data.name)}</strong>
      <span>{String(data.role)}</span>
      {below !== null && (
        // `nodrag nopan`: a press on the button is the button's, not the pane's or the node's.
        <button
          className="fold nodrag nopan"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Show' : 'Hide'} the ${String(below)} below ${String(data.name)}`}
          onClick={() => branches?.toggle(id)}
        >
          {collapsed ? `+${String(below)}` : '−'}
        </button>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// Outside the component, so they keep their identity between renders.
const nodeTypes = { person: PersonNode };
const features = [editingFeature];

// --- the chart ---------------------------------------------------------------------------------------------

function Chart() {
  // A controlled flow: `useCollapsibleTree` writes `hidden` through the instance, which hands it to
  // `onNodesChange` and `onEdgesChange` like any other edit.
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const { collapsedNodeIds, isCollapsed, toggleNode, collapseNode, expandNode, getDescendantIds } =
    useCollapsibleTree();

  // Who is under each person, whatever is open: for the counts on the buttons.
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of people) {
      const under = getDescendantIds(p.id, initialEdges).length;
      if (under > 0) out.set(p.id, under);
    }
    return out;
  }, [getDescendantIds]);

  // Who is hidden — the hook has written it to the nodes too, but the layout needs it in this render, and
  // the nodes it wrote to arrive in the next.
  const hidden = useMemo(() => {
    const out = new Set<string>();
    for (const id of collapsedNodeIds) for (const d of getDescendantIds(id, initialEdges)) out.add(d);
    return out;
  }, [collapsedNodeIds, getDescendantIds]);

  // The tree closes up around what is hidden. Positions are derived, not stored: nothing here is dragged.
  const positions = useMemo(() => layoutShown(people.filter((p) => !hidden.has(p.id))), [hidden]);
  const placed = useMemo(
    () =>
      nodes.map((n) => {
        const at = positions[n.id];
        return at ? { ...n, position: at } : n;
      }),
    [nodes, positions],
  );

  const branches = useMemo<Branches>(
    () => ({ isCollapsed, toggle: toggleNode, below: (id) => counts.get(id) ?? null }),
    [isCollapsed, toggleNode, counts],
  );

  return (
    <BranchesContext.Provider value={branches}>
      <header>
        <h1>A collapsible tree</h1>
        <div className="group" role="group" aria-label="Branches">
          <button onClick={() => { for (const id of executives) collapseNode(id); }}>
            Collapse to executives
          </button>
          <button
            disabled={collapsedNodeIds.size === 0}
            onClick={() => { for (const id of [...collapsedNodeIds]) expandNode(id); }}
          >
            Expand all
          </button>
        </div>
        <span className="count" aria-live="polite">
          {people.length - hidden.size} of {people.length} shown
        </span>
      </header>
      <main>
        <FlowingerCore
          nodes={placed}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          features={features}
          minZoom={0.2}
          fitView
          nodesDraggable={false}
        >
          <Background />
        </FlowingerCore>
        <Controls position="bottom-right" showInteractive={false} />
      </main>
    </BranchesContext.Provider>
  );
}

export function App() {
  return (
    <div className="app">
      <FlowingerProvider>
        <Chart />
      </FlowingerProvider>
    </div>
  );
}
