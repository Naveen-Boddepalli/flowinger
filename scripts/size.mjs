// Bundles scripts/size-entry.ts the way an app would (minified, React external) and prints its gzip size.
//   pnpm size            print it
//   pnpm size --max 22   fail if it is over 22 kB
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const maxArg = process.argv.indexOf('--max');
const max = maxArg === -1 ? null : Number(process.argv[maxArg + 1]);

const result = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: true,
    lib: { entry: 'scripts/size-entry.ts', formats: ['es'], fileName: 'size' },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output[0];
const kb = gzipSync(output.code, { level: 9 }).length / 1000;
console.log(`consumer subset: ${(output.code.length / 1000).toFixed(1)} kB minified, ${kb.toFixed(1)} kB gzip`);
if (max !== null && kb > max) {
  console.error(`over the ${String(max)} kB budget`);
  process.exit(1);
}
