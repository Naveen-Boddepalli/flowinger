// What each feature adds to the bare `FlowingerCore`, in gzipped kB — each on its own, so a feature includes
// what it needs (drag brings selection and auto-pan; reconnect brings connect). The same bundling as
// `pnpm size`: minified, React external, development checks removed.
//
//   pnpm size:features
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = resolve(tmpdir(), 'flowinger-feature-sizes');
const names = ['selection','drag','connect','reconnect','boxSelect','selectionRect','delete','culling','editing','events','edgeLabels','panKey','a11y','stacking','colorMode','smooth','zoomKey','debug'];
mkdirSync(scratch, { recursive: true });
async function size(feature) {
  const file = resolve(scratch, `${feature ?? 'none'}.ts`);
  const imp = feature ? `import { ${feature}Feature } from '${root}/src/index.ts';` : '';
  writeFileSync(file, `import { FlowingerCore } from '${root}/src/index.ts';\n${imp}\nexport const X = FlowingerCore;\nexport const F = ${feature ? `[${feature}Feature]` : '[]'};\n`);
  const result = await build({
    configFile: false, logLevel: 'silent', root,
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: true, lib: { entry: file, formats: ['es'], fileName: 'x' }, rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] } },
  });
  const out = (Array.isArray(result) ? result[0] : result).output[0];
  return gzipSync(out.code, { level: 9 }).length / 1000;
}
const base = await size(null);
console.log('core', base.toFixed(2));
for (const n of names) {
  const s = await size(n);
  console.log(n.padEnd(14), '+' + (s - base).toFixed(2));
}
