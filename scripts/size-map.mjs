// Where the lean entry's bytes come from: `pnpm size`'s lean build (the core with no features, minified, React
// external, development checks removed), split by source file. Each file's share is its share of the code the
// bundler emitted for it before minifying, applied to the whole bundle's gzipped size, so a file's figure is an
// estimate. What taking something out would save is measured by building without it: `--candidates` does that
// for the parts D3 of PLAN-2.0.md weighs, each cut out with a text patch that leaves the rest dead code.
//
//   node scripts/size-map.mjs                 the lean entry, by file
//   node scripts/size-map.mjs --full          the whole canvas (scripts/size-entry.ts), by file
//   node scripts/size-map.mjs --candidates    what each candidate would save the lean entry
import { gzipSync } from 'node:zlib';
import { relative, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const full = process.argv.includes('--full');
const entry = full ? 'scripts/size-entry.ts' : 'scripts/size-entry-lean.ts';

/** Candidates for leaving the core: each a set of [file, from, to] replacements that makes the part unreachable. */
const NON_BEZIER_PATHS = [
  ['src/paths.ts', "type === 'straight'", 'false'],
  ['src/paths.ts', "type === 'smoothstep'", 'false'],
  ['src/paths.ts', "type === 'step'", 'false'],
];
const NESTING = [
  [
    'src/FlowingerCore.tsx',
    'useMemo(createTreeInfo, [])',
    'useMemo(() => () => ({ origin: new Map(), depth: new Map(), hidden: new Set() }), [])',
  ],
];
const CANDIDATES = [
  ['edge paths other than bezier (straight, smoothstep, step)', NON_BEZIER_PATHS],
  ["the canvas's nesting pass (where a child's parent is, its depth, hidden with its parent)", NESTING],
  ['both', [...NON_BEZIER_PATHS, ...NESTING]],
];

async function bundle(patches = []) {
  const patch = {
    name: 'size-map-patch',
    enforce: 'pre',
    transform(code, id) {
      let out = code;
      for (const [file, from, to] of patches) {
        if (!id.endsWith(file)) continue;
        if (!out.includes(from)) throw new Error(`${file} no longer has: ${from}`);
        out = out.split(from).join(to);
      }
      return out === code ? null : out;
    },
  };
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [patch],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: true,
      lib: { entry, formats: ['es'], fileName: 'size' },
      rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] },
    },
  });
  const chunk = (Array.isArray(result) ? result[0] : result).output[0];
  return { chunk, gzip: gzipSync(chunk.code, { level: 9 }).length / 1000 };
}

const { chunk, gzip } = await bundle();
if (process.argv.includes('--candidates')) {
  console.log(`lean: ${gzip.toFixed(3)} kB gzip. Taking out…\n`);
  for (const [name, patches] of CANDIDATES) {
    const without = await bundle(patches);
    console.log(`${(gzip - without.gzip).toFixed(3).padStart(7)} kB  ${name}`);
  }
} else {
  const files = Object.entries(chunk.modules)
    .map(([id, m]) => ({ file: relative(root, id), length: m.renderedLength }))
    .filter((f) => f.length > 0)
    .sort((a, b) => b.length - a.length);
  const total = files.reduce((n, f) => n + f.length, 0);
  console.log(`${full ? 'whole canvas' : 'lean'}: ${gzip.toFixed(2)} kB gzip, from ${String(files.length)} files\n`);
  console.log('  share  ~kB gzip  file');
  for (const f of files) {
    const share = f.length / total;
    console.log(`${(share * 100).toFixed(1).padStart(6)}%  ${(share * gzip).toFixed(2).padStart(7)}  ${f.file}`);
  }
}
