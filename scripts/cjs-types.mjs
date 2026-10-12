// Declarations for `require`.
//
// The package is "type": "module", so every dist/*.d.ts is typed as an ES module — including the one a
// CommonJS consumer got through the `require` condition. TypeScript's node16/nodenext resolution
// rejects that (Are the Types Wrong calls it "masquerading as ESM"): `import x = require('flowinger')`
// resolved to types that say "this is ESM" over a file that is CJS.
//
// A `.d.cts` next to each `.d.ts` would not do: the declarations import one another, and a CJS
// declaration file may not import an ESM one. So the same files go once more under dist/cjs/, in a
// directory whose package.json says "type": "commonjs" — there they are CJS declarations, and the
// `require` condition points at them. They hold only types, so the copy costs nothing at runtime.
//
//   pnpm build   (runs after tsc has emitted dist/*.d.ts)
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const out = join(dist, 'cjs');

rmSync(out, { recursive: true, force: true });

/** Every declaration file under `dir`, as a path relative to `dist`, leaving `dist/cjs` itself out. */
function declarations(dir, base = '') {
  const found = [];
  for (const entry of readdirSync(join(dir, base), { withFileTypes: true })) {
    const rel = join(base, entry.name);
    if (entry.isDirectory()) {
      if (rel === 'cjs') continue;
      found.push(...declarations(dir, rel));
    } else if (entry.name.endsWith('.d.ts')) {
      found.push(rel);
    }
  }
  return found;
}

const files = declarations(dist);
if (!files.includes('index.d.ts')) {
  console.error('cjs-types: dist/index.d.ts is missing — run tsc first (pnpm build)');
  process.exit(1);
}
for (const rel of files) {
  const to = join(out, rel);
  mkdirSync(join(to, '..'), { recursive: true });
  cpSync(join(dist, rel), to);
}
writeFileSync(join(out, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
console.log(`cjs-types: ${files.length} declaration files -> ${out}/`);

const subpaths = [
  { name: 'history', target: 'pro/history' },
  { name: 'clipboard', target: 'pro/clipboard' },
  { name: 'snaplines', target: 'pro/snaplines' },
  { name: 'export', target: 'pro/export' },
  { name: 'smart-edges', target: 'pro/smartEdges' },
  { name: 'shapes', target: 'pro/shapes' },
  { name: 'tree', target: 'pro/tree' },
  { name: 'pro', target: 'pro/index' },
];

for (const { name, target } of subpaths) {
  mkdirSync(name, { recursive: true });
  writeFileSync(
    join(name, 'package.json'),
    `${JSON.stringify(
      {
        main: `../dist/${target}.cjs`,
        module: `../dist/${target}.js`,
        types: `../dist/${target}.d.ts`,
      },
      null,
      2,
    )}\n`,
  );
}
