// What the tools a consumer uses make of the package, which is ES modules only from 2.0 (D2 of PLAN-2.0.md): the
// packed package is installed into empty projects and loaded, rendered or type-checked the way each tool does it.
// Three checks are known to fail, as "Upgrading to 2.0" says, and are reported as such: Jest's default config,
// TypeScript 5's node16 from a .cts, and node10 (which TypeScript 7 removed) for a subpath. Any other outcome fails.
//
//   pnpm build && node scripts/check-toolchains.mjs
//   … --node /usr/local/bin/node                                    also run the Node checks with another Node
//   … --only jest,next                                              only the checks whose names contain these
//   … --keep                                                        leave the projects in the temp folder
//
// What it checks:
//   - Node: `require` and `import` each load the main entry and a pro subpath, and a server render draws the graph;
//   - Jest, default config (its own CommonJS module registry): the same render from a test;
//   - Vitest: the same render from a test;
//   - TypeScript 5 on `node16` (a .cts and a .mts), on `bundler`, and on `node10` (gone from TypeScript 7, but
//     still what typesVersions and the stub folders are for); TypeScript 7 on `nodenext`;
//   - Next.js, pages router and app router: `next build` of a page that renders the canvas;
//   - Are the Types Wrong on the tarball (with its `esm-only` profile for `--esm-only`), and publint.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at === -1 ? null : args[at + 1];
};
const only = valueOf('--only')?.split(',') ?? null;
const keep = args.includes('--keep');
const nodes = [process.execPath, ...(valueOf('--node') ? [valueOf('--node')] : [])];
const scratch = mkdtempSync(join(tmpdir(), 'flowinger-toolchains-'));
const bin = (name) => join(root, 'node_modules', '.bin', name);

function run(command, argv, cwd, env = {}) {
  const result = spawnSync(command, argv, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n');
    throw new Error(out || `${command} exited ${String(result.status)}`);
  }
  return result.stdout;
}
const write = (dir, files) => {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), typeof text === 'string' ? text : `${JSON.stringify(text, null, 2)}\n`);
  }
};

const results = [];
/** `known`: this fails, for the reason given, and that is expected — it is reported, and does not fail the run. */
const check = (name, fn, known) => {
  if (only && !only.some((o) => name.includes(o))) return;
  try {
    const detail = String(fn() ?? '').trim();
    results.push({ name, ok: true, label: 'ok  ', detail: known ? `${detail} (known to fail before: ${known})` : detail });
  } catch (error) {
    results.push({ name, ok: Boolean(known), label: known ? 'KNOWN' : 'FAIL', detail: known ? `${known}\n${error.message}` : error.message });
  }
};

// The same small graph, rendered on the server; `load` is how the toolchain gets flowinger.
const graph = `
  const nodes = [
    { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
    { id: 'b', position: { x: 0, y: 120 }, data: { label: 'B' } },
  ];
  const edges = [{ id: 'a-b', source: 'a', target: 'b' }];
  const html = renderToString(createElement(ReactFlow, { nodes, edges, defaultViewport: { x: 5, y: 6, zoom: 2 } }));
  const want = ['rf__node-a', 'rf__node-b', 'rf__edge-a-b', 'translate(5px, 6px) scale(2)'];
  const missing = want.filter((w) => !html.includes(w));
  if (missing.length) throw new Error('missing from the HTML: ' + missing.join(', '));
  if (typeof useUndoRedo !== 'function') throw new Error('flowinger/history has no useUndoRedo');
`;
const cjsHead = `const { createElement } = require('react');
const { renderToString } = require('react-dom/server');
const { ReactFlow } = require('flowinger');
const { useUndoRedo } = require('flowinger/history');
`;
const esmHead = `import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ReactFlow } from 'flowinger';
import { useUndoRedo } from 'flowinger/history';
`;
// A consumer that resolves the main entry, a pro subpath and React Flow's type names.
const consumer = `import { FlowingerCanvas, ReactFlow, useReactFlow, type Node, type Edge, type OnConnect, type ReactFlowInstance } from 'flowinger';
import { useUndoRedo } from 'flowinger/history';
export const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, data: {} }];
export const edges: Edge[] = [];
export const onConnect: OnConnect = (c) => { void c.source; };
export type I = ReactFlowInstance;
export const parts = [FlowingerCanvas, ReactFlow, useReactFlow, useUndoRedo] as const;
`;
const tsconfig = (compilerOptions, files) => ({
  compilerOptions: { target: 'es2022', strict: true, skipLibCheck: false, noEmit: true, jsx: 'react-jsx', types: [], ...compilerOptions },
  files,
});

try {
  // `--ignore-scripts`: dist/ is already built, and `prepare` would build it again.
  const packed = run('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', scratch], root).trim().split('\n').pop();
  const tarball = join(scratch, packed);
  console.log(`${tarball}\n`);

  // One project for the light toolchains, one for Next.js.
  const app = join(scratch, 'app');
  write(app, {
    'package.json': { name: 'toolchains', private: true },
    'render.cjs': `${cjsHead}${graph}console.log(html.length + ' characters of HTML');\n`,
    'render.mjs': `${esmHead}${graph}console.log(html.length + ' characters of HTML');\n`,
    'jest/render.test.js': `${cjsHead}\ntest('renders on the server', () => {${graph}});\n`,
    'vitest/render.test.mjs': `import { test } from 'vitest';\n${esmHead}\ntest('renders on the server', () => {${graph}});\n`,
    'ts/consumer.cts': consumer,
    'ts/consumer.mts': consumer,
    'ts/consumer.ts': consumer,
    'ts/node16.json': tsconfig({ module: 'node16', moduleResolution: 'node16' }, ['consumer.cts', 'consumer.mts']),
    'ts/bundler.json': tsconfig({ module: 'esnext', moduleResolution: 'bundler' }, ['consumer.ts']),
    'ts/node10.json': tsconfig({ module: 'commonjs', moduleResolution: 'node10' }, ['consumer.ts']),
    'ts/nodenext.json': tsconfig({ module: 'nodenext', moduleResolution: 'nodenext' }, ['consumer.cts', 'consumer.mts']),
  });
  run('npm', ['install', '--no-audit', '--no-fund', tarball, 'react@19', 'react-dom@19', '@types/react@19', '@types/react-dom@19', 'jest@30', 'vitest@latest', 'typescript@5'], app);
  const version = (name) => JSON.parse(readFileSync(join(app, 'node_modules', name, 'package.json'), 'utf8')).version;

  for (const node of nodes) {
    const v = run(node, ['--version'], app).trim();
    check(`Node ${v}: require`, () => run(node, ['render.cjs'], app));
    check(`Node ${v}: import`, () => run(node, ['render.mjs'], app));
  }
  // Jest loads modules through its own registry, not Node's. It can `require` an ES module only where `vm` has
  // SourceTextModule's synchronous evaluation: behind --experimental-vm-modules, on Node 22.21+ or 24.9+.
  for (const [label, env, known] of [
    ['default config', {}, 'Jest cannot require an ES module without --experimental-vm-modules'],
    ['NODE_OPTIONS=--experimental-vm-modules', { NODE_OPTIONS: '--experimental-vm-modules' }],
  ]) {
    check(`Jest ${version('jest')} on Node ${process.version}, ${label}`, () => {
      const jest = join(app, 'node_modules', 'jest', 'bin', 'jest.js');
      const out = spawnSync(process.execPath, [jest, '--rootDir', 'jest', '--ci'], { cwd: app, encoding: 'utf8', env: { ...process.env, ...env } });
      if (out.status !== 0) throw new Error(`${out.stdout}${out.stderr}`.trim().split('\n').slice(0, 6).join('\n'));
      return 'the test passed';
    }, known);
  }
  check(`Vitest ${version('vitest')}`, () => {
    run(join(app, 'node_modules', '.bin', 'vitest'), ['run', '--root', 'vitest', '--environment', 'node'], app);
    return 'the test passed';
  });
  for (const [config, label, known] of [
    ['node16', 'node16: .cts (require) and .mts (import)', 'node16 will not import an ES module from a .cts: use nodenext'],
    ['bundler', 'bundler'],
    ['node10', 'node10', 'node10 does not read exports, so finds no subpath (TypeScript 7 removed it)'],
  ]) {
    check(
      `TypeScript ${version('typescript')}, ${label}`,
      () => run(join(app, 'node_modules', '.bin', 'tsc'), ['-p', `${config}.json`], join(app, 'ts')) || 'no errors',
      known,
    );
  }
  check(`TypeScript ${run(bin('tsc'), ['--version'], root).trim().replace('Version ', '')}, nodenext: .cts and .mts`, () => run(bin('tsc'), ['-p', 'nodenext.json'], join(app, 'ts')) || 'no errors');
  check('Are the Types Wrong, esm-only profile', () => {
    run(bin('attw'), [tarball, '--profile', 'esm-only'], root);
    return 'no problems';
  });
  check('publint --strict', () => run(bin('publint'), ['--strict', '--pack', 'npm', join(app, 'node_modules', 'flowinger')], root).split('\n').slice(-2).join(' '));

  if (!only || only.some((o) => 'Next.js'.includes(o) || o === 'next')) {
    const next = join(scratch, 'next');
    const page = `import { ReactFlow } from 'flowinger';
const nodes = [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }, { id: 'b', position: { x: 0, y: 120 }, data: { label: 'B' } }];
const edges = [{ id: 'a-b', source: 'a', target: 'b' }];
export default function Page() {
  return <div style={{ width: 600, height: 400 }}><ReactFlow nodes={nodes} edges={edges} fitView /></div>;
}
`;
    write(next, {
      'package.json': { name: 'toolchains-next', private: true, scripts: { build: 'next build' } },
      'pages/index.jsx': page,
      'app/layout.jsx': `export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n`,
      'app/client/page.jsx': `'use client';\n${page}`,
    });
    run('npm', ['install', '--no-audit', '--no-fund', tarball, 'next@latest', 'react@19', 'react-dom@19'], next);
    const nextVersion = JSON.parse(readFileSync(join(next, 'node_modules', 'next', 'package.json'), 'utf8')).version;
    check(`Next.js ${nextVersion}: next build, pages router and app router`, () => {
      run('npm', ['run', 'build'], next, { NEXT_TELEMETRY_DISABLED: '1' });
      const built = ['.next/server/pages/index.html', '.next/server/app/client.html'].filter((f) => existsSync(join(next, f)));
      for (const f of built) {
        const html = readFileSync(join(next, f), 'utf8');
        if (!html.includes('rf__node-a')) throw new Error(`${f} has no node in it`);
      }
      return `built; prerendered with the graph in it: ${built.join(', ') || 'none found'}`;
    });
  }
} finally {
  for (const r of results) console.log(`${r.label}  ${r.name}${r.detail ? `\n      ${r.detail.replace(/\n/g, '\n      ')}` : ''}`);
  if (keep) console.log(`\nkept: ${scratch}`);
  else rmSync(scratch, { recursive: true, force: true });
}
process.exit(results.length > 0 && results.every((r) => r.ok) ? 0 : 1);
