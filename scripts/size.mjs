// Bundles what an app would import (minified, React external) and prints the gzip size of each:
//   full  — <ReactFlow>, every feature: what a React Flow app gets (scripts/size-entry.ts)
//   lean  — <FlowingerCore> with no features: an app that only shows and pans a graph (scripts/size-entry-lean.ts)
//
//   pnpm size                          print both
//   pnpm size --max-full 24 --max-lean 16   fail if either is over its budget
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const budget = (flag) => {
  const at = process.argv.indexOf(flag);
  return at === -1 ? null : Number(process.argv[at + 1]);
};
const entries = [
  { name: 'full', entry: 'scripts/size-entry.ts', max: budget('--max-full') },
  { name: 'lean', entry: 'scripts/size-entry-lean.ts', max: budget('--max-lean') },
];

let failed = false;
for (const { name, entry, max } of entries) {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    // As in an app's production build, where the development-only checks are dead code.
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
  console.log(`${name}: ${(output.code.length / 1000).toFixed(1)} kB minified, ${kb.toFixed(2)} kB gzip`);
  if (max !== null && kb > max) {
    console.error(`${name} is over its ${String(max)} kB budget`);
    failed = true;
  }
}
if (failed) process.exit(1);
