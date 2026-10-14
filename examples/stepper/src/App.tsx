import { useEffect, useMemo, useRef, useState } from 'react';
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
import { carried, initialState, next, type Inputs, type Link, type RunState, type Status, type Step } from './simulate';

// --- the workflow ---------------------------------------------------------------------------------------

const steps: Step[] = [
  { id: 'receive', label: 'Order received' },
  { id: 'validate', label: 'Validate' },
  { id: 'decide', label: 'Over $1,000?', decide: (inputs) => (inputs.amount > 1000 ? 'decide-review' : 'decide-auto') },
  { id: 'review', label: 'Manual review' },
  { id: 'auto', label: 'Auto-approve' },
  { id: 'charge', label: 'Charge card' },
  { id: 'receipt', label: 'Send receipt' },
  { id: 'done', label: 'Close order' },
];

const links: Link[] = [
  { id: 'receive-validate', source: 'receive', target: 'validate' },
  { id: 'validate-decide', source: 'validate', target: 'decide' },
  { id: 'decide-review', source: 'decide', target: 'review', label: 'yes' },
  { id: 'decide-auto', source: 'decide', target: 'auto', label: 'no' },
  { id: 'review-charge', source: 'review', target: 'charge' },
  { id: 'auto-charge', source: 'auto', target: 'charge' },
  { id: 'charge-receipt', source: 'charge', target: 'receipt' },
  { id: 'receipt-done', source: 'receipt', target: 'done' },
];

/** Where each step sits: a fixed layout, left to right, the decision's branches above and below. */
const place: Record<string, [number, number]> = {
  receive: [0, 100],
  validate: [190, 100],
  decide: [380, 100],
  review: [570, 20],
  auto: [570, 180],
  charge: [760, 100],
  receipt: [950, 100],
  done: [1140, 100],
};

const statusLabel: Record<Status, string> = {
  idle: 'waiting',
  running: 'running',
  done: 'done',
  failed: 'failed',
  skipped: 'skipped',
};

/** A step, coloured by its status. The status is drawn from the run, passed in `data` for this render. */
function StepNode({ data }: NodeProps) {
  const status = data.status as Status;
  return (
    <div className={`step step-${status}${data.decision === true ? ' step-decision' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="step-label">{String(data.label)}</div>
      <div className="step-status">
        {status === 'running' && <span className="spinner" aria-hidden="true" />}
        {statusLabel[status]}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { step: StepNode };

// --- the run --------------------------------------------------------------------------------------------

function Stepper() {
  const [inputs, setInputs] = useState<Inputs>({ amount: 640, declineCard: false });
  const [state, setState] = useState<RunState>(() => initialState(steps));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const logEnd = useRef<HTMLLIElement | null>(null);

  const step = () => setState((current) => next(current, steps, links, inputs));
  const reset = () => {
    setPlaying(false);
    setState(initialState(steps));
  };

  // Playing is stepping on a timer, until the run is over.
  useEffect(() => {
    if (!playing) return;
    if (state.finished) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(step, speed);
    return () => clearTimeout(timer);
  });

  // A block, not an expression: scrollIntoView returns a promise in newer browsers, and an effect may return
  // only a clean-up function.
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [state.log.length]);

  // The run becomes the canvas: each node's status, and each edge drawn by what it carries.
  const nodes: Node[] = useMemo(
    () =>
      steps.map((s) => ({
        id: s.id,
        type: 'step',
        position: { x: place[s.id]![0], y: place[s.id]![1] },
        width: 150,
        height: 58,
        data: { label: s.label, status: state.status[s.id], decision: s.decide !== undefined },
      })),
    [state],
  );
  const byId = useMemo(() => new Map(steps.map((s) => [s.id, s])), []);
  const edges: Edge[] = useMemo(
    () =>
      links.map((l) => {
        const took = carried(l, state, byId);
        const flowing = took && state.status[l.target] === 'running';
        const from = state.status[l.source];
        const never =
          from === 'failed' || from === 'skipped' || (from === 'done' && byId.get(l.source)?.decide !== undefined && !took);
        return {
          id: l.id,
          source: l.source,
          target: l.target,
          label: l.label,
          type: 'smoothstep',
          animated: flowing,
          markerEnd: 'arrowclosed',
          className: flowing ? 'edge-flowing' : took ? 'edge-taken' : never ? 'edge-dead' : 'edge-idle',
        };
      }),
    [state, byId],
  );

  const outcome = !state.finished ? null : steps.some((s) => state.status[s.id] === 'failed') ? 'failed' : 'complete';

  return (
    <div className="layout">
      <div className="canvas">
        <FlowingerCore nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }}>
          <Background />
          <Controls position="bottom-left" showInteractive={false} />
        </FlowingerCore>
      </div>
      <aside className="side">
        <div className="controls">
          <button className="primary" onClick={() => setPlaying((p) => !p)} disabled={state.finished}>
            {playing ? 'Pause' : state.tick === 0 ? 'Run' : 'Resume'}
          </button>
          <button onClick={step} disabled={playing || state.finished}>Step</button>
          <button onClick={reset} disabled={state.tick === 0}>Reset</button>
        </div>
        <label className="row">
          Speed
          <input type="range" min={150} max={1500} step={50} value={1650 - speed} onChange={(e) => setSpeed(1650 - Number(e.target.value))} />
        </label>

        <fieldset disabled={state.tick > 0}>
          <legend>Order {state.tick > 0 && '(reset to change)'}</legend>
          <label className="row">
            Amount
            <input
              type="range"
              min={50}
              max={2500}
              step={10}
              value={inputs.amount}
              onChange={(e) => setInputs((i) => ({ ...i, amount: Number(e.target.value) }))}
            />
            <span>${inputs.amount.toLocaleString()}</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={inputs.declineCard} onChange={(e) => setInputs((i) => ({ ...i, declineCard: e.target.checked }))} />
            The card is declined
          </label>
        </fieldset>

        <p className={`outcome${outcome ? ` outcome-${outcome}` : ''}`} role="status">
          {outcome === 'complete' ? `Complete in ${state.tick} ticks.` : outcome === 'failed' ? `Failed at tick ${state.tick}.` : `Tick ${state.tick}`}
        </p>
        <ol className="log">
          {state.log.map((line, i) => (
            <li key={i} ref={i === state.log.length - 1 ? logEnd : undefined}>{line}</li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

export function App() {
  return (
    <FlowingerProvider>
      <Stepper />
    </FlowingerProvider>
  );
}
