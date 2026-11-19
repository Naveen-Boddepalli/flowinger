// The playground's diagrams (Playground.tsx), and the small layered layout that places them top to bottom or
// left to right. Each preset is a DAG: a node's rank is its longest path from a root, unless it names one.
import type { Edge, Node } from 'flowinger';

export type Direction = 'TB' | 'LR';

type PresetNode = { id: string; label: string; rank?: number };

export type Preset = {
  id: string;
  name: string;
  nodes: PresetNode[];
  edges: [source: string, target: string][];
};

export const presets: Preset[] = [
  {
    id: 'query',
    name: 'Query plan',
    nodes: [
      { id: 'scan', label: 'Scan orders' },
      { id: 'filter', label: 'Filter: paid' },
      { id: 'customers', label: 'Scan customers', rank: 1 },
      { id: 'join', label: 'Join customers' },
      { id: 'sum', label: 'Sum by customer' },
      { id: 'sort', label: 'Sort by total' },
    ],
    edges: [
      ['scan', 'filter'],
      ['filter', 'join'],
      ['customers', 'join'],
      ['join', 'sum'],
      ['sum', 'sort'],
    ],
  },
  {
    id: 'org',
    name: 'Org chart',
    nodes: [
      { id: 'ceo', label: 'CEO' },
      { id: 'cto', label: 'CTO' },
      { id: 'cfo', label: 'CFO' },
      { id: 'platform', label: 'Platform' },
      { id: 'design', label: 'Design' },
      { id: 'finance', label: 'Finance ops' },
      { id: 'payroll', label: 'Payroll' },
    ],
    edges: [
      ['ceo', 'cto'],
      ['ceo', 'cfo'],
      ['cto', 'platform'],
      ['cto', 'design'],
      ['cfo', 'finance'],
      ['cfo', 'payroll'],
    ],
  },
  {
    id: 'ci',
    name: 'CI pipeline',
    nodes: [
      { id: 'push', label: 'git push' },
      { id: 'lint', label: 'Lint' },
      // Build in the middle, in line with the browser tests it feeds, so no edge runs behind them.
      { id: 'build', label: 'Build' },
      { id: 'test', label: 'Unit tests' },
      { id: 'e2e', label: 'Browser tests' },
      { id: 'staging', label: 'Deploy staging' },
      { id: 'production', label: 'Deploy production' },
    ],
    edges: [
      ['push', 'lint'],
      ['push', 'test'],
      ['push', 'build'],
      ['build', 'e2e'],
      ['lint', 'staging'],
      ['test', 'staging'],
      ['e2e', 'staging'],
      ['staging', 'production'],
    ],
  },
];

// Space between ranks and between neighbours in a rank, for each direction. Positions are node centres
// (the canvas has nodeOrigin [0.5, 0.5]).
const GAP = {
  TB: { rank: 96, sibling: 168 },
  LR: { rank: 204, sibling: 64 },
};

export function layout(preset: Preset, direction: Direction): Node[] {
  const rank = new Map<string, number>();
  const rankOf = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    const node = preset.nodes.find((n) => n.id === id);
    const parents = preset.edges.filter(([, target]) => target === id).map(([source]) => source);
    const value = node?.rank ?? (parents.length ? Math.max(...parents.map(rankOf)) + 1 : 0);
    rank.set(id, value);
    return value;
  };

  const byRank = new Map<number, PresetNode[]>();
  for (const node of preset.nodes) {
    const r = rankOf(node.id);
    byRank.set(r, [...(byRank.get(r) ?? []), node]);
  }

  const gap = GAP[direction];
  return preset.nodes.map((node) => {
    const r = rankOf(node.id);
    const row = byRank.get(r) ?? [node];
    const along = (row.indexOf(node) - (row.length - 1) / 2) * gap.sibling;
    const across = r * gap.rank;
    return {
      id: node.id,
      type: 'step',
      position: direction === 'TB' ? { x: along, y: across } : { x: across, y: along },
      data: { label: node.label, direction },
    };
  });
}

export function edgesOf(preset: Preset): Edge[] {
  return preset.edges.map(([source, target]) => ({
    id: `${source}-${target}`,
    source,
    target,
    markerEnd: 'arrowclosed',
  }));
}

/** The diagram on screen as code a reader could paste: the nodes where they are now, the props switched on. */
export function codeFor(
  nodes: Node[],
  edges: Edge[],
  options: { animated: boolean; minimap: boolean; snap: boolean },
): string {
  const nodeLines = nodes.map((n) => {
    const { x, y } = n.position;
    return `  { id: '${n.id}', position: { x: ${Math.round(x)}, y: ${Math.round(y)} }, data: { label: '${String(n.data.label)}' } },`;
  });
  const edgeLines = edges.map(
    (e) => `  { id: '${e.id}', source: '${e.source}', target: '${e.target}'${options.animated ? ', animated: true' : ''} },`,
  );
  const props = ['nodes={nodes}', 'edges={edges}', 'nodeOrigin={[0.5, 0.5]}', 'fitView'];
  if (options.snap) props.push('snapToGrid', 'snapGrid={[20, 20]}');
  return [
    'const nodes = [',
    ...nodeLines,
    '];',
    '',
    'const edges = [',
    ...edgeLines,
    '];',
    '',
    `<FlowingerCanvas ${props.join(' ')}>`,
    '  <Background />',
    ...(options.minimap ? ['  <MiniMap />'] : []),
    '</FlowingerCanvas>',
  ].join('\n');
}
