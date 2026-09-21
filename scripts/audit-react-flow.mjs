// How much of React Flow's public surface flowinger has — read from React Flow's own type declarations, not
// from memory. Compares what each package exports, and the members of the types you write against most
// (props, the instance, nodes, edges, handles and the built-in components), resolved by the TypeScript
// compiler so inherited members and unions are counted.
//
//   pnpm build                                   # it reads dist/index.d.ts
//   node scripts/audit-react-flow.mjs <path to @xyflow/react/dist/esm/index.d.ts>
//   node scripts/audit-react-flow.mjs <path> --json   # the same, as data
//
// Members that are plain DOM/SVG attributes (`id`, `role`, `aria-*`, `onClick`, …) are counted apart from
// React Flow's own: flowinger's components take few of them.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const rfEntry = process.argv[2];
if (!rfEntry || rfEntry.startsWith('--') || !existsSync(rfEntry)) {
  console.error('usage: node scripts/audit-react-flow.mjs <path to @xyflow/react/dist/esm/index.d.ts> [--json]');
  process.exit(2);
}
const asJson = process.argv.includes('--json');
const ROOT = resolve(import.meta.dirname, '..');
const FL = join(ROOT, 'dist/index.d.ts');
if (!existsSync(FL)) {
  console.error('build first (pnpm build): dist/index.d.ts is missing');
  process.exit(2);
}
const RF = resolve(rfEntry);

/** Every name a declaration file exports, following `export *` and `export { … } from`. */
function exportedNames(entry) {
  const names = new Set();
  const seen = new Set();
  const find = (p) => [p, `${p}.d.ts`, join(p, 'index.d.ts')].find((c) => existsSync(c) && statSync(c).isFile());
  const walk = (file) => {
    const f = find(normalize(file));
    if (!f || seen.has(f)) return;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/gs)) {
      for (const raw of m[1].split(',')) {
        const n = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop();
        if (n) names.add(n);
      }
    }
    for (const m of src.matchAll(/export\s*\*\s*from\s*'([^']+)'/g)) walk(join(dirname(f), m[1]));
    for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g)) {
      names.add(m[1]);
    }
  };
  walk(entry);
  return names;
}

/** The members of some types, by the compiler: `specs` are [label, type expression over the namespace `M`]. */
function membersOf(entry, specs, tag) {
  const file = join(ROOT, `__audit_${tag}.ts`); // virtual: never written, but `react` resolves from here
  const source =
    `import type * as M from ${JSON.stringify(entry.replace(/\.d\.ts$/, ''))};\n` +
    specs.map(([, expr], i) => `export type T${String(i)} = ${expr};`).join('\n');
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  host.readFile = (f) => (f === file ? source : read(f));
  host.fileExists = (f) => f === file || exists(f);
  const program = ts.createProgram([file], options, host);
  const checker = program.getTypeChecker();
  const out = new Map();
  ts.forEachChild(program.getSourceFile(file), (node) => {
    if (!ts.isTypeAliasDeclaration(node)) return;
    const type = checker.getTypeAtLocation(node.name);
    const set = new Set();
    for (const t of type.isUnion() ? type.types : [type]) for (const p of checker.getPropertiesOfType(t)) set.add(p.name);
    out.set(specs[Number(node.name.text.slice(1))][0], [...set].sort());
  });
  return out;
}

// [label, React Flow's type, flowinger's type]
const SPECS = [
  ['ReactFlow props', 'M.ReactFlowProps', 'M.FlowingerProps'],
  ['instance (useReactFlow)', 'M.ReactFlowInstance', 'M.FlowingerInstance'],
  ['Node', 'M.Node', 'M.Node'],
  ['Edge', 'M.Edge', 'M.Edge'],
  ['NodeProps', 'M.NodeProps', 'M.NodeProps'],
  ['EdgeProps', 'M.EdgeProps', 'M.EdgeProps'],
  ['Handle props', 'M.HandleProps', 'M.HandleProps'],
  ['Background props', 'M.BackgroundProps', 'M.BackgroundProps'],
  ['MiniMap props', 'M.MiniMapProps', 'import("react").ComponentProps<typeof M.MiniMap>'],
  ['Controls props', 'M.ControlProps', 'import("react").ComponentProps<typeof M.Controls>'],
  ['NodeResizer props', 'M.NodeResizerProps', 'M.NodeResizerProps'],
  ['NodeToolbar props', 'M.NodeToolbarProps', 'M.NodeToolbarProps'],
  ['BaseEdge props', 'M.BaseEdgeProps', 'M.BaseEdgeProps'],
  ['fitView options', 'M.FitViewOptions', 'M.FitViewOptions'],
];

const DOM_SPEC = [
  ['dom', 'import("react").HTMLAttributes<HTMLElement> & import("react").SVGAttributes<SVGElement> & import("react").DOMAttributes<Element>'],
  ['aria', 'import("react").AriaAttributes'],
];
const dom = new Set([...[...membersOf(FL, DOM_SPEC, 'dom').values()].flat(), 'children', 'className', 'style', 'key', 'ref']);

const rf = membersOf(RF, SPECS.map(([l, a]) => [l, a]), 'rf');
const fl = membersOf(FL, SPECS.map(([l, , b]) => [l, b]), 'fl');

const theirs = exportedNames(RF);
const ours = exportedNames(FL);
const report = {
  exports: { reactFlow: theirs.size, flowinger: ours.size, shared: [...theirs].filter((n) => ours.has(n)).length, missing: [...theirs].filter((n) => !ours.has(n)).sort() },
  types: SPECS.map(([label]) => {
    const all = rf.get(label) ?? [];
    const own = all.filter((n) => !dom.has(n));
    const have = new Set(fl.get(label) ?? []);
    return {
      type: label,
      reactFlowSpecific: own.length,
      shared: own.filter((n) => have.has(n)).length,
      missing: own.filter((n) => !have.has(n)),
      domAttributesMissing: all.filter((n) => dom.has(n) && !have.has(n)).length,
    };
  }),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const e = report.exports;
  console.log(`exports: React Flow ${String(e.reactFlow)}, flowinger ${String(e.flowinger)}, shared ${String(e.shared)}`);
  const values = e.missing.filter((n) => /^[a-z]/.test(n) || /(Edge|Text|Toolbar|Button|Control|MiniMapNode)$/.test(n));
  console.log(`  React Flow exports flowinger lacks: ${String(e.missing.length)} (${String(e.missing.length - values.length)} are types)`);
  console.log(`  functions, hooks and components: ${values.join(', ')}`);
  for (const t of report.types) {
    console.log(`\n${t.type}: ${String(t.shared)} of ${String(t.reactFlowSpecific)} React Flow members` +
      (t.domAttributesMissing > 0 ? ` (+${String(t.domAttributesMissing)} DOM attributes not accepted)` : ''));
    if (t.missing.length > 0) console.log(`  missing: ${t.missing.join(', ')}`);
  }
}
