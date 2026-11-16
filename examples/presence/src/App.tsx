import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import * as Y from 'yjs';
import {
  Background,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  Panel,
  Position,
  ViewportPortal,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'flowinger';
import { joinRoom, type Room } from './room';

// --- who this tab is ------------------------------------------------------------------------------------

const names = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara', 'Dennis', 'Radia'];
const colors = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

/** A name and colour per tab, kept for the tab's life so a reload is the same person. */
function me(): { name: string; color: string } {
  try {
    const saved = sessionStorage.getItem('flowinger-presence-user');
    if (saved) return JSON.parse(saved) as { name: string; color: string };
  } catch {
    // no storage: a new name each load is fine
  }
  const i = Math.floor(Math.random() * names.length);
  const user = { name: names[i]!, color: colors[i]! };
  try {
    sessionStorage.setItem('flowinger-presence-user', JSON.stringify(user));
  } catch {
    // as above
  }
  return user;
}

/** What each person shares about themselves: who they are, where their pointer is (in graph units), and what
 *  they have selected. Awareness is not part of the document: it goes when they do. */
interface Presence {
  user: { name: string; color: string };
  cursor: { x: number; y: number } | null;
  selected: string[];
}

interface Peer extends Presence {
  id: number;
}

// --- the graph ------------------------------------------------------------------------------------------

/** A node, with a ring and a name tag for each other person who has it selected. */
function CardNode({ data, selected }: NodeProps) {
  const peers = (data.peers as Peer[] | undefined) ?? [];
  const ring = peers[0]?.user.color;
  return (
    <div className={`card${selected ? ' card-selected' : ''}`} style={ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined}>
      <Handle type="target" position={Position.Left} />
      {String(data.label)}
      {peers.length > 0 && (
        <div className="tags">
          {peers.map((p) => (
            <span key={p.id} style={{ background: p.user.color }}>
              {p.user.name}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { card: CardNode };

const card = (id: string, x: number, y: number, label: string): Node => ({ id, type: 'card', position: { x, y }, data: { label } });
const sampleNodes: Node[] = [
  card('idea', 0, 80, 'Idea'),
  card('design', 220, 0, 'Design'),
  card('build', 220, 160, 'Build'),
  card('ship', 440, 80, 'Ship'),
];
const link = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target, markerEnd: 'arrowclosed' });
const sampleEdges: Edge[] = [link('idea', 'design'), link('idea', 'build'), link('design', 'ship'), link('build', 'ship')];

/** What is shared of a node: everything but what is this tab's own — its selection and measured size. */
function shared(node: Node): Node {
  const { selected: _selected, dragging: _dragging, measured: _measured, ...rest } = node;
  return rest;
}

/**
 * The document's nodes, in the order this tab already has them, with what is this tab's own kept: a remote
 * edit moves a node, it does not deselect it here.
 */
function fromDoc<T extends Node | Edge>(map: Y.Map<T>, local: readonly T[]): T[] {
  const mine = new Map(local.map((item) => [item.id, item]));
  const order = [...local.map((item) => item.id).filter((id) => map.has(id)), ...[...map.keys()].filter((id) => !mine.has(id))];
  return order.map((id) => {
    const remote = map.get(id) as T;
    const own = mine.get(id) as (T & { selected?: boolean; measured?: unknown }) | undefined;
    return own ? ({ ...remote, selected: own.selected, ...('measured' in own ? { measured: own.measured } : {}) } as T) : remote;
  });
}

/** This tab's own edits carry this origin, so its observer does not apply them a second time. */
const LOCAL = 'local';

function Board({ room }: { room: Room }) {
  const { doc, awareness } = room;
  const nodeMap = useMemo(() => doc.getMap<Node>('nodes'), [doc]);
  const edgeMap = useMemo(() => doc.getMap<Edge>('edges'), [doc]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const { screenToFlowPosition } = useReactFlow();
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // The document is the truth: what the others change arrives here and becomes this tab's state.
  useEffect(() => {
    const onNodes = (_: unknown, tx: Y.Transaction) => {
      if (tx.origin !== LOCAL) setNodes((local) => fromDoc(nodeMap, local));
    };
    const onEdges = (_: unknown, tx: Y.Transaction) => {
      if (tx.origin !== LOCAL) setEdges((local) => fromDoc(edgeMap, local));
    };
    nodeMap.observe(onNodes);
    edgeMap.observe(onEdges);
    setNodes((local) => fromDoc(nodeMap, local));
    setEdges((local) => fromDoc(edgeMap, local));
    // The first tab in the room puts the sample in — after waiting for the others, so a tab that joins late
    // does not write the sample over what they have done.
    void room.ready.then(() => {
      if (nodeMap.size > 0 || edgeMap.size > 0) return;
      doc.transact(() => {
        for (const n of sampleNodes) nodeMap.set(n.id, n);
        for (const e of sampleEdges) edgeMap.set(e.id, e);
      });
    });
    return () => {
      nodeMap.unobserve(onNodes);
      edgeMap.unobserve(onEdges);
    };
  }, [doc, nodeMap, edgeMap, room.ready]);

  // Who else is here, and what they are doing.
  useEffect(() => {
    awareness.setLocalState({ user: me(), cursor: null, selected: [] } satisfies Presence);
    const onChange = () => {
      const others: Peer[] = [];
      awareness.getStates().forEach((state, id) => {
        if (id !== doc.clientID && (state as Presence).user) others.push({ id, ...(state as Presence) });
      });
      setPeers(others);
    };
    awareness.on('change', onChange);
    onChange();
    return () => awareness.off('change', onChange);
  }, [awareness, doc]);

  /** A change is applied here at once, and what is shared of it is written to the document for the others. */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, nodesRef.current);
      setNodes(next);
      doc.transact(() => {
        for (const change of changes) {
          if (change.type === 'remove') nodeMap.delete(change.id);
          else if (change.type === 'position' && change.position) {
            const node = next.find((n) => n.id === change.id);
            if (node) nodeMap.set(node.id, shared(node));
          } else if (change.type === 'add') nodeMap.set(change.item.id, shared(change.item));
          // 'select' and 'dimensions' are this tab's own.
        }
      }, LOCAL);
      if (changes.some((c) => c.type === 'select')) {
        awareness.setLocalStateField('selected', next.filter((n) => n.selected).map((n) => n.id));
      }
    },
    [doc, nodeMap, awareness],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((current) => applyEdgeChanges(changes, current));
      doc.transact(() => {
        for (const change of changes) if (change.type === 'remove') edgeMap.delete(change.id);
      }, LOCAL);
    },
    [doc, edgeMap],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        const next = addEdge({ ...connection, markerEnd: 'arrowclosed' }, current);
        const added = next.find((e) => !current.includes(e));
        if (added) doc.transact(() => edgeMap.set(added.id, added), LOCAL);
        return next;
      });
    },
    [doc, edgeMap],
  );

  const addCard = () => {
    const id = Math.random().toString(36).slice(2, 8);
    const at = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const node = card(id, at.x - 60, at.y - 20, `Card ${id.slice(0, 3)}`);
    setNodes((current) => [...current, node]);
    doc.transact(() => nodeMap.set(id, node), LOCAL);
  };

  // The pointer, in graph units, so it lands on the same spot for someone panned or zoomed elsewhere.
  const onPointerMove = (event: PointerEvent) => {
    awareness.setLocalStateField('cursor', screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };
  const onPointerLeave = () => awareness.setLocalStateField('cursor', null);

  // Others' selections are drawn on the nodes — computed for this render, not stored in the graph.
  const shown = useMemo(() => {
    if (!peers.some((p) => p.selected.length > 0)) return nodes;
    return nodes.map((n) => {
      const by = peers.filter((p) => p.selected.includes(n.id));
      return by.length > 0 ? { ...n, data: { ...n.data, peers: by } } : n;
    });
  }, [nodes, peers]);

  const self = me();
  return (
    <div className="board" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <FlowingerCanvas
        nodes={shown}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: '14%' }}
      >
        <Background />
        <Cursors peers={peers} />
        <Panel position="top-left">
          <div className="toolbar">
            <span className="me" style={{ background: self.color }}>{self.name}</span>
            <span>
              {peers.length === 0 ? 'Alone here.' : `With ${peers.map((p) => p.user.name).join(', ')}.`}
            </span>
            <button onClick={() => window.open(window.location.href, '_blank')}>Open another tab</button>
            <button onClick={addCard}>Add card</button>
          </div>
        </Panel>
        <Controls position="bottom-left" />
      </FlowingerCanvas>
    </div>
  );
}

/**
 * The others' pointers, drawn in graph units inside the viewport, so each sits on the node its owner is
 * pointing at whatever this tab's pan and zoom — and scaled back by the zoom, so it stays one size.
 */
function Cursors({ peers }: { peers: Peer[] }) {
  const { zoom } = useViewport();
  return (
    <ViewportPortal>
      {peers.map((p) =>
        p.cursor ? (
          <div
            key={p.id}
            className="cursor"
            style={{ transform: `translate(${p.cursor.x}px, ${p.cursor.y}px) scale(${1 / zoom})`, color: p.user.color }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M1 1l6.5 15 2.2-6.3L16 7.5z" fill="currentColor" stroke="white" strokeWidth="1.2" />
            </svg>
            <span style={{ background: p.user.color }}>{p.user.name}</span>
          </div>
        ) : null,
      )}
    </ViewportPortal>
  );
}

export function App() {
  // The room comes from the address, so `?room=team` is a separate board.
  const name = new URLSearchParams(window.location.search).get('room') ?? 'demo';
  const [room, setRoom] = useState<Room | null>(null);
  useEffect(() => {
    const joined = joinRoom(name);
    setRoom(joined);
    return () => joined.leave();
  }, [name]);
  if (!room) return null;
  return (
    <FlowingerProvider>
      <Board room={room} />
    </FlowingerProvider>
  );
}
