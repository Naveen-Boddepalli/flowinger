// The landing page's playground, in place of a single live editor: pick a diagram, lay it out top to bottom or
// left to right, and switch on a prop at a time with the line of code it is. Switching glides: nodes in both
// diagrams move to their new places, new ones fade in, gone ones fade out, and the view frames where they are
// going. Drag, connect and delete still work as in "Make it interactive" (docs/getting-started.md). It renders
// on the server, so the first diagram is in the HTML before React loads.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  FlowingerCanvas,
  FlowingerProvider,
  Handle,
  MiniMap,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
} from 'flowinger';
import { codeFor, edgesOf, layout, presets, type Direction, type Preset } from './playgroundPresets.ts';
import './Playground.css';

const GLIDE_MS = 420;

function Step({ data, selected }: NodeProps) {
  const lr = data.direction === 'LR';
  return (
    <div className={selected ? 'flowinger-step is-selected' : 'flowinger-step'}>
      <Handle type="target" position={lr ? Position.Left : Position.Top} />
      {String(data.label)}
      <Handle type="source" position={lr ? Position.Right : Position.Bottom} />
    </div>
  );
}

const nodeTypes = { step: Step };

/** A row of mutually exclusive buttons with a pill that slides to the pressed one. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const button = group.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (button) setPill({ left: button.offsetLeft, width: button.offsetWidth });
    };
    measure();
    // Web fonts arriving change the buttons' widths.
    const observer = new ResizeObserver(measure);
    if (group.current) observer.observe(group.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={group} role="group" aria-label={label} className={pill ? 'fl-seg is-ready' : 'fl-seg'}>
      <span
        className="fl-seg-pill"
        aria-hidden="true"
        style={pill ? { translate: `${pill.left}px 0`, width: pill.width } : undefined}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A switch, with the code it stands for beside it. */
function Toggle({
  checked,
  onChange,
  label,
  code,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  code: string;
  className?: string;
}) {
  return (
    <label className={className ? `fl-toggle ${className}` : 'fl-toggle'}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="fl-toggle-track" aria-hidden="true" />
      <span className="fl-toggle-text">{label}</span>
      <code className={checked ? 'is-on' : undefined}>{code}</code>
    </label>
  );
}

/** Where `nodes` will sit, as a rectangle for `fitBounds`; a node not yet drawn is guessed from its label. */
function boundsOf(nodes: Node[], measured: Map<string, Node>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const size = measured.get(node.id)?.measured;
    const width = size?.width ?? String(node.data.label).length * 8 + 32;
    const height = size?.height ?? 38;
    minX = Math.min(minX, node.position.x - width / 2);
    maxX = Math.max(maxX, node.position.x + width / 2);
    minY = Math.min(minY, node.position.y - height / 2);
    maxY = Math.max(maxY, node.position.y + height / 2);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function Editor() {
  const [presetId, setPresetId] = useState(presets[0]!.id);
  const [direction, setDirection] = useState<Direction>('TB');
  const [animated, setAnimated] = useState(false);
  const [minimap, setMinimap] = useState(true);
  const [snap, setSnap] = useState(false);
  const [copied, setCopied] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout(presets[0]!, 'TB'));
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesOf(presets[0]!));
  const { fitBounds } = useReactFlow();

  // The latest state, for a glide that starts from wherever the last one (or a drag) left things.
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const frame = useRef(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = query.matches;
    const update = () => (reducedMotion.current = query.matches);
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  const show = (preset: Preset, dir: Direction) => {
    cancelAnimationFrame(frame.current);
    const target = layout(preset, dir);
    const from = new Map(nodesRef.current.filter((n) => n.className !== 'is-leaving').map((n) => [n.id, n]));
    const targetIds = new Set(target.map((n) => n.id));
    const oldEdgeIds = new Set(edgesRef.current.map((e) => e.id));
    const finalEdges = edgesOf(preset).map((e) => ({ ...e, animated }));
    const settled = target.map((n) => ({ ...n, measured: from.get(n.id)?.measured }));
    const instant = reducedMotion.current;

    fitBounds(boundsOf(target, from), { padding: '12%', duration: instant ? 0 : GLIDE_MS });

    if (instant) {
      setNodes(settled);
      setEdges(finalEdges);
      return;
    }

    // While gliding: gone nodes and edges fade where they are, new ones fade in where they will be.
    const leaving = [...from.values()]
      .filter((n) => !targetIds.has(n.id))
      .map((n) => ({ ...n, className: 'is-leaving', selected: false, draggable: false, selectable: false }));
    const finalIds = new Set(finalEdges.map((e) => e.id));
    setEdges([
      ...finalEdges.map((e) => (oldEdgeIds.has(e.id) ? e : { ...e, className: 'is-entering' })),
      ...edgesRef.current.filter((e) => !finalIds.has(e.id)).map((e) => ({ ...e, className: 'is-leaving' })),
    ]);

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / GLIDE_MS);
      const k = 1 - (1 - t) ** 3;
      if (t < 1) {
        const moving = settled.map((n) => {
          const old = from.get(n.id);
          if (!old) return { ...n, className: 'is-entering' };
          return {
            ...n,
            position: {
              x: old.position.x + (n.position.x - old.position.x) * k,
              y: old.position.y + (n.position.y - old.position.y) * k,
            },
          };
        });
        setNodes([...moving, ...leaving]);
        frame.current = requestAnimationFrame(tick);
      } else {
        setNodes(settled);
        setEdges(finalEdges);
      }
    };
    frame.current = requestAnimationFrame(tick);
  };

  const pickPreset = (id: string) => {
    if (id === presetId) return;
    setPresetId(id);
    show(presets.find((p) => p.id === id)!, direction);
  };

  const pickDirection = (dir: Direction) => {
    if (dir === direction) return;
    setDirection(dir);
    show(presets.find((p) => p.id === presetId)!, dir);
  };

  const toggleAnimated = (on: boolean) => {
    setAnimated(on);
    setEdges((current) => current.map((e) => ({ ...e, animated: on })));
  };

  const code = useMemo(
    () =>
      codeFor(
        nodes.filter((n) => n.className !== 'is-leaving'),
        edges.filter((e) => e.className !== 'is-leaving'),
        { animated, minimap, snap },
      ),
    [nodes, edges, animated, minimap, snap],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard (an insecure page, a refused permission): the code is there to select by hand.
    }
  };

  return (
    <>
      <div className="fl-pg-bar">
        <Segmented
          label="Diagram"
          options={presets.map((p) => ({ value: p.id, label: p.name }))}
          value={presetId}
          onChange={pickPreset}
        />
        <Segmented
          label="Layout"
          options={[
            { value: 'TB' as const, label: '↓ Top to bottom' },
            { value: 'LR' as const, label: '→ Left to right' },
          ]}
          value={direction}
          onChange={pickDirection}
        />
      </div>

      <div className="flowinger-live fl-pg-stage">
        <FlowingerCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connection) =>
            setEdges((current) => addEdge({ ...connection, markerEnd: 'arrowclosed', animated }, current))
          }
          nodeOrigin={[0.5, 0.5]}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          snapToGrid={snap}
          snapGrid={[20, 20]}
          fitView
          fitViewOptions={{ padding: '12%' }}
        >
          <Background />
          <Controls position="bottom-left" />
          {minimap && <MiniMap position="bottom-right" />}
        </FlowingerCanvas>
      </div>

      <div className="fl-pg-toggles">
        <Toggle checked={animated} onChange={toggleAnimated} label="Animated edges" code="animated: true" />
        {/* Phones never show the minimap (site.css), so no switch for it there. */}
        <Toggle checked={minimap} onChange={setMinimap} label="Minimap" code="<MiniMap />" className="is-minimap" />
        <Toggle checked={snap} onChange={setSnap} label="Snap to grid" code="snapToGrid" />
      </div>

      <details className="fl-pg-code">
        <summary>The code for this diagram</summary>
        <div className="fl-pg-code-body">
          <button type="button" className="fl-pg-copy" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <pre>
            <code>{code}</code>
          </pre>
        </div>
      </details>
    </>
  );
}

export function Playground() {
  return (
    <div className="fl-playground not-content">
      <FlowingerProvider>
        <Editor />
      </FlowingerProvider>
    </div>
  );
}
