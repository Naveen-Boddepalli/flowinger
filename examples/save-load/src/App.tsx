import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import {
  Background,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  Panel,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from 'flowinger';
import { parseFlow, stringifyFlow, toFlowFile, type FlowFile } from './flowFile';

/** A node whose text is part of the graph: what you type is in `data`, so it is saved with the rest. The
 *  input has `nodrag` so typing in it does not move the node; the grip beside it is what you drag by. */
function NoteNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const onText = (event: ChangeEvent<HTMLInputElement>) => updateNodeData(id, { text: event.target.value });
  return (
    <div className={`note${selected ? ' note-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="grip" aria-hidden="true">⠿</span>
      <input className="nodrag" value={String(data.text ?? '')} onChange={onText} aria-label="Note text" />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { note: NoteNode };
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const defaultEdgeOptions = { markerEnd: 'arrowclosed' } as const;

const sample: FlowFile = {
  version: 1,
  nodes: [
    { id: 'n1', type: 'note', position: { x: 0, y: 0 }, data: { text: 'Draft' } },
    { id: 'n2', type: 'note', position: { x: 230, y: -50 }, data: { text: 'Review' } },
    { id: 'n3', type: 'note', position: { x: 460, y: 0 }, data: { text: 'Publish' } },
  ],
  edges: [
    { id: 'n1-n2', source: 'n1', target: 'n2', markerEnd: 'arrowclosed' },
    { id: 'n2-n3', source: 'n2', target: 'n3', markerEnd: 'arrowclosed' },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

// Browser storage can be missing or refuse (a private window, a full quota), so every use is guarded and
// the app works without it.
const storageKey = 'flowinger-save-load';
function readStored(): FlowFile | null {
  try {
    const text = localStorage.getItem(storageKey);
    if (!text) return null;
    const parsed = parseFlow(text);
    return 'flow' in parsed ? parsed.flow : null;
  } catch {
    return null;
  }
}

// Read once, before the first render: the canvas starts where the last session left it.
const stored = readStored();
const initial = stored ?? sample;

function Editor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const { toObject, setViewport, fitView, screenToFlowPosition, addNodes } = useReactFlow();
  const [text, setText] = useState(() => stringifyFlow(initial));
  const [status, setStatus] = useState(stored ? 'Restored what you saved last time.' : 'A sample graph. Edit it, then save.');
  const fileInput = useRef<HTMLInputElement | null>(null);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((current) => addEdge(connection, current)),
    [setEdges],
  );

  // `toObject()` is the graph as it stands — dragged positions, measured sizes, the view — not the arrays
  // the app last passed in.
  const current = () => toFlowFile(toObject());

  /** Puts a file on the canvas: the graph, then the view it was saved with. */
  const load = (flow: FlowFile, message: string) => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
    void setViewport(flow.viewport);
    setText(stringifyFlow(flow));
    setStatus(message);
  };

  /** Checks text before it reaches the canvas, and says what is wrong with it if it cannot. */
  const loadText = (source: string, from: string) => {
    const parsed = parseFlow(source);
    if ('error' in parsed) setStatus(`Could not load ${from}: ${parsed.error}`);
    else load(parsed.flow, `Loaded ${from}: ${count(parsed.flow.nodes.length, 'node')}, ${count(parsed.flow.edges.length, 'edge')}.`);
  };

  const save = () => {
    const flow = current();
    setText(stringifyFlow(flow));
    try {
      localStorage.setItem(storageKey, stringifyFlow(flow));
      setStatus('Saved in this browser. Reload the page and it comes back.');
    } catch {
      setStatus('This browser would not store it (a private window?). Download it instead.');
    }
  };

  const restore = () => {
    const flow = readStored();
    if (flow) load(flow, 'Restored the last save.');
    else setStatus('Nothing saved in this browser yet.');
  };

  const download = () => {
    const blob = new Blob([stringifyFlow(current())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: 'graph.json' });
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded graph.json.');
  };

  const open = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so choosing the same file again still fires
    if (file) loadText(await file.text(), file.name);
  };

  const addNote = () => {
    const at = screenToFlowPosition({ x: window.innerWidth / 3, y: window.innerHeight / 2 });
    addNodes({ id: crypto.randomUUID().slice(0, 8), type: 'note', position: at, data: { text: 'New note' } });
  };

  const reset = () => {
    load(sample, 'Back to the sample (not saved until you save).');
    void fitView({ padding: 0.3 });
  };

  return (
    <div className="layout">
      <div className="canvas">
        <FlowingerCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          deleteKeyCode={['Backspace', 'Delete']}
          // A saved graph comes back at the view it was saved with; the sample is framed.
          defaultViewport={stored?.viewport}
          fitView={!stored}
          fitViewOptions={{ padding: 0.3 }}
        >
          <Background />
          <Panel position="top-left">
            <div className="toolbar">
              <button onClick={addNote}>Add note</button>
              <button onClick={save}>Save</button>
              <button onClick={restore}>Restore</button>
              <button onClick={download}>Download</button>
              <button onClick={() => fileInput.current?.click()}>Open…</button>
              <button onClick={reset}>Reset</button>
              <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => void open(e)} />
            </div>
          </Panel>
          <Controls position="bottom-left" />
        </FlowingerCanvas>
      </div>
      <aside className="side">
        <p className="status" role="status">{status}</p>
        <label htmlFor="json">The graph as JSON — edit it, or paste one in</label>
        <textarea id="json" value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
        <div className="toolbar">
          <button onClick={() => loadText(text, 'the text')}>Load this</button>
          <button onClick={() => setText(stringifyFlow(current()))}>Show the canvas</button>
        </div>
      </aside>
    </div>
  );
}

export function App() {
  return (
    <FlowingerProvider>
      <Editor />
    </FlowingerProvider>
  );
}
