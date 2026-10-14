// The workflow's rules, apart from how it is drawn: a pure function from one state to the next, so a tick can
// be stepped, played, undone (keep the old state) or tested without a canvas.
//
// Each tick, every step that was running finishes (or fails), and every step whose inputs have all settled
// starts — or is skipped, when none of its inputs brought work to it. A decision finishes by choosing one of
// its outgoing edges; the others carry nothing.

export type Status = 'idle' | 'running' | 'done' | 'failed' | 'skipped';

export interface Step {
  id: string;
  label: string;
  /** Decides which outgoing edge to take, from the run's inputs. */
  decide?: (inputs: Inputs) => string;
}

export interface Link {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/** What the run was started with — here, the order's amount and whether the card is declined. */
export interface Inputs {
  amount: number;
  declineCard: boolean;
}

export interface RunState {
  tick: number;
  status: Record<string, Status>;
  /** For each decision that has finished, the edge it took. */
  chosen: Record<string, string>;
  log: string[];
  /** Nothing is running and nothing can start: the run is over. */
  finished: boolean;
}

export function initialState(steps: Step[]): RunState {
  return { tick: 0, status: Object.fromEntries(steps.map((s) => [s.id, 'idle'])), chosen: {}, log: [], finished: false };
}

/** Whether an edge brought work to its target: its source is done and, for a decision, chose it. */
export function carried(link: Link, state: RunState, steps: Map<string, Step>): boolean {
  if (state.status[link.source] !== 'done') return false;
  return steps.get(link.source)?.decide === undefined || state.chosen[link.source] === link.id;
}

/** Whether an edge will never bring work: its source ended without it. */
function dead(link: Link, state: RunState, steps: Map<string, Step>): boolean {
  const from = state.status[link.source];
  if (from === 'failed' || from === 'skipped') return true;
  return from === 'done' && steps.get(link.source)?.decide !== undefined && state.chosen[link.source] !== link.id;
}

/** The step that fails when the card is declined. */
const FAILS_WHEN_DECLINED = 'charge';

export function next(state: RunState, stepList: Step[], links: Link[], inputs: Inputs): RunState {
  if (state.finished) return state;
  const steps = new Map(stepList.map((s) => [s.id, s]));
  const status = { ...state.status };
  const chosen = { ...state.chosen };
  const tick = state.tick + 1;
  const log: string[] = [];
  const say = (line: string) => log.push(`${String(tick).padStart(2, '0')}  ${line}`);

  // What was running finishes.
  for (const step of stepList) {
    if (state.status[step.id] !== 'running') continue;
    if (step.id === FAILS_WHEN_DECLINED && inputs.declineCard) {
      status[step.id] = 'failed';
      say(`${step.label} failed: card declined`);
      continue;
    }
    status[step.id] = 'done';
    if (step.decide) {
      const edge = step.decide(inputs);
      chosen[step.id] = edge;
      say(`${step.label} → ${links.find((l) => l.id === edge)?.label ?? edge}`);
    } else say(`${step.label} done`);
  }

  // What can start, starts; what nothing will reach, is skipped. Judged on the state after the finishes above,
  // so work moves one step a tick.
  const settled: RunState = { ...state, status, chosen };
  let started = false;
  for (const step of stepList) {
    if (state.status[step.id] !== 'idle') continue;
    const incoming = links.filter((l) => l.target === step.id);
    if (incoming.length === 0) {
      // A start: it starts on the first tick.
      if (state.tick === 0) {
        status[step.id] = 'running';
        started = true;
        say(`${step.label} started`);
      }
      continue;
    }
    const brought = incoming.filter((l) => carried(l, settled, steps));
    const waiting = incoming.some((l) => !carried(l, settled, steps) && !dead(l, settled, steps));
    if (waiting) continue;
    if (brought.length > 0) {
      status[step.id] = 'running';
      started = true;
      say(`${step.label} started`);
    } else {
      status[step.id] = 'skipped';
      say(`${step.label} skipped`);
    }
  }

  const running = Object.values(status).some((s) => s === 'running');
  const finished = !running && !started;
  if (finished) {
    const failed = stepList.find((s) => status[s.id] === 'failed');
    say(failed ? `Run failed at ${failed.label}` : 'Run complete');
  }
  return { tick, status, chosen, log: [...state.log, ...log], finished };
}
