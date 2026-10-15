// What a consumer gets from npm, checked from the outside: the published package installed into an empty
// project, as someone would install it — not the packed tarball CI builds against.
//
//   node scripts/check-registry.mjs              the `latest` version
//   node scripts/check-registry.mjs 1.0.0-rc.1   a given version (or a dist-tag: next)
//   node scripts/check-registry.mjs latest --react 18
//
// It checks, in a throwaway directory:
//   - `npm audit signatures`: the registry's signatures, and the provenance attestation naming release.yml;
//   - `require` and `import` both load it, and a server render from each draws the nodes and edges;
//   - a strict TypeScript consumer on `nodenext` — a `.cts` and an `.mts`, `skipLibCheck` off — resolves the
//     main entry, a pro subpath and React Flow's type names, for `require` and for `import`.
// Release notes for a version are in CHANGELOG.md; this is the check the 0.4.0 release did by hand (plan.md).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const reactAt = args.indexOf('--react');
const react = reactAt === -1 ? '19' : args[reactAt + 1];
// The version is the argument that is neither a flag nor the value of `--react`.
const version = args.find((a, i) => !a.startsWith('--') && (reactAt === -1 || i !== reactAt + 1)) ?? 'latest';
const dir = mkdtempSync(join(tmpdir(), 'flowinger-registry-'));
const tsc = join(root, 'node_modules', '.bin', 'tsc');

const run = (cmd, argv, opts = {}) =>
  execFileSync(cmd, argv, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const results = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}${error.stdout || error.stderr ? '' : error.message}`;
    results.push({ name, ok: false, detail: out.trim().split('\n').slice(-12).join('\n') });
  }
};

try {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'registry-check', private: true }, null, 2));
  run('npm', [
    'install',
    '--no-audit',
    '--no-fund',
    `flowinger@${version}`,
    `react@${react}`,
    `react-dom@${react}`,
    `@types/react@${react}`,
    `@types/react-dom@${react}`,
  ]);
  const installed = JSON.parse(run('node', ['-p', "JSON.stringify(require('flowinger/package.json'))"])).version;
  console.log(`flowinger@${installed} from the registry (asked for ${version}), React ${react}, in ${dir}\n`);

  check('npm audit signatures: registry signatures and provenance', () => {
    const out = run('npm', ['audit', 'signatures']);
    if (!/verified registry signature/.test(out)) throw Object.assign(new Error('no verified signatures'), { stdout: out });
    if (!/verified attestation/.test(out)) throw Object.assign(new Error('no verified attestations'), { stdout: out });
    // …and flowinger's own is among them: a SLSA provenance statement for this version.
    const predicate = run('npm', ['view', `flowinger@${installed}`, 'dist.attestations.provenance.predicateType']).trim();
    if (!/slsa\.dev\/provenance/.test(predicate)) throw new Error(`flowinger@${installed} has no provenance (${predicate || 'none'})`);
    return `${out.trim().split('\n').filter((l) => /verified/.test(l)).join('; ')}; flowinger's provenance: ${predicate}`;
  });

  // The same small graph, rendered on the server from each module system.
  const graph = `
    const nodes = [
      { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
      { id: 'b', position: { x: 0, y: 120 }, data: { label: 'B' } },
    ];
    const edges = [{ id: 'a-b', source: 'a', target: 'b' }];
    const html = renderToString(createElement(ReactFlow, { nodes, edges, defaultViewport: { x: 5, y: 6, zoom: 2 } }));
    const want = ['data-testid="rf__node-a"', 'data-testid="rf__node-b"', 'data-testid="rf__edge-a-b"', 'translate(5px, 6px) scale(2)'];
    const missing = want.filter((w) => !html.includes(w));
    if (missing.length) { console.error('missing: ' + missing.join(', ')); process.exit(1); }
    console.log(html.length + ' characters of HTML, nodes, edge and framing in it');
  `;
  writeFileSync(
    join(dir, 'render.cjs'),
    `const { createElement } = require('react');\nconst { renderToString } = require('react-dom/server');\nconst { ReactFlow } = require('flowinger');\nrequire('flowinger/history');\n${graph}`,
  );
  writeFileSync(
    join(dir, 'render.mjs'),
    `import { createElement } from 'react';\nimport { renderToString } from 'react-dom/server';\nimport { ReactFlow } from 'flowinger';\nimport 'flowinger/history';\n${graph}`,
  );
  check('require: loads, and a server render draws the graph', () => run('node', ['render.cjs']).trim());
  check('import: loads, and a server render draws the graph', () => run('node', ['render.mjs']).trim());

  // A strict consumer on nodenext: the .cts is resolved through `require`, the .mts through `import`.
  const consumer = `
    import { FlowingerCanvas, ReactFlow, useReactFlow, type Node, type Edge, type OnConnect, type ReactFlowInstance } from 'flowinger';
    import { useUndoRedo } from 'flowinger/history';
    export const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, data: {} }];
    export const edges: Edge[] = [];
    export const onConnect: OnConnect = (c) => { void c.source; };
    export type I = ReactFlowInstance;
    export const parts = [FlowingerCanvas, ReactFlow, useReactFlow, useUndoRedo] as const;
  `;
  writeFileSync(join(dir, 'consumer.cts'), consumer);
  writeFileSync(join(dir, 'consumer.mts'), consumer);
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'es2022',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          jsx: 'react-jsx',
          types: [],
        },
        files: ['consumer.cts', 'consumer.mts'],
      },
      null,
      2,
    ),
  );
  check('TypeScript nodenext, strict, skipLibCheck off: .cts (require) and .mts (import)', () => {
    run(tsc, ['-p', 'tsconfig.json']);
    return `tsc ${run(tsc, ['--version']).trim()}: no errors`;
  });
} finally {
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail.replace(/\n/g, '\n      ')}` : ''}`);
  rmSync(dir, { recursive: true, force: true });
}
process.exit(results.length > 0 && results.every((r) => r.ok) ? 0 : 1);
