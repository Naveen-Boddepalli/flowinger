// What a consumer really pays: bundles a small import from the *built* package (dist/index.js is one
// pre-bundled file, so a feature only drops out if nothing left at its top level keeps it alive).
//   pnpm build && node scripts/size-dist.mjs [--max-lean 16]
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const dist = resolve('dist/index.js');
const at = process.argv.indexOf('--max-lean');
const max = at === -1 ? null : Number(process.argv[at + 1]);
const dir = mkdtempSync(join(tmpdir(), 'flowinger-size-'));
const entry = join(dir, 'entry.js');
writeFileSync(
  entry,
  `export { Background, BackgroundVariant, FlowingerCore, Handle, Position, FlowingerProvider, useReactFlow, useStore } from ${JSON.stringify(dist)};\n`,
);
const result = await build({
  configFile: false,
  logLevel: 'silent',
  root: dir,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    write: false,
    minify: true,
    lib: { entry, formats: ['es'], fileName: 'size' },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output[0];
const kb = gzipSync(output.code, { level: 9 }).length / 1000;
console.log(`lean, from dist: ${(output.code.length / 1000).toFixed(1)} kB minified, ${kb.toFixed(1)} kB gzip`);
// A feature that leaked in would leave its own markup behind.
const leaked = ['flowinger-reconnect-anchor', 'flowinger-selection', 'flowinger-connection-line'].filter(
  (needle) => output.code.includes(needle),
);
if (leaked.length > 0) console.log(`  still carries: ${leaked.join(', ')}`);
if ((max !== null && kb > max) || leaked.length > 0) process.exit(1);
