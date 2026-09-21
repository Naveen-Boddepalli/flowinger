// @vitest-environment node
// What an app really pays. The package is one pre-bundled file, so a feature only drops out of a
// consumer's bundle if nothing left at the top level of that file keeps it alive — a `memo()` or
// `createContext()` call not marked pure did exactly that. This builds the library, then bundles small
// consumers from the *built* output, the way an app's bundler would.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';

const external = ['react', 'react-dom', 'react/jsx-runtime'];
const workDir = mkdtempSync(join(tmpdir(), 'flowinger-bundle-'));
const libDir = join(workDir, 'lib');

/** Bundles `export { names } from <the built library>` the way an app would: minified, production. */
async function consumer(names: string[]): Promise<{ code: string; gzip: number }> {
  const entry = join(workDir, `entry-${names.join('-')}.js`);
  writeFileSync(entry, `export { ${names.join(', ')} } from ${JSON.stringify(join(libDir, 'index.js'))};\n`);
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root: workDir,
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: true, lib: { entry, formats: ['es'], fileName: 'x' }, rollupOptions: { external } },
  });
  const built = (Array.isArray(result) ? result[0] : result) as { output: { code: string }[] } | undefined;
  const code = built?.output[0]?.code ?? '';
  return { code, gzip: gzipSync(code, { level: 9 }).length };
}

/**
 * Text that only a feature's own code leaves behind — and that survives minification: a property name,
 * a string, a class. (A function's name does not; it is mangled, so it would prove nothing either way.)
 * The second test finds every one of these in the whole canvas, so none is a needle that cannot be seen.
 */
const FEATURES: Record<string, string[]> = {
  drag: ['beginNodeDrag', 'nudgeSelection'],
  'expand parent': ['expandParent'],
  connect: ['beginConnection', 'flowinger-connection-line'],
  reconnect: ['startReconnect', 'flowinger-reconnect-anchor'],
  'box selection': ['flowinger-selection', 'subscribeSelectionRect'],
  'own state': ['defaultNodes'],
  'dev warnings': ['do nothing without'],
};

const LEAN = ['Background', 'FlowingerCore', 'FlowingerProvider', 'Handle', 'Position', 'useReactFlow', 'useStore'];
const FULL = ['Background', 'ReactFlow', 'ReactFlowProvider', 'Handle', 'Position', 'useReactFlow', 'useStore'];

beforeAll(async () => {
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      outDir: libDir,
      emptyOutDir: true,
      lib: { entry: resolve('src/index.ts'), formats: ['es'], fileName: 'index' },
      rollupOptions: { external },
    },
  });
}, 120_000);

describe('what a consumer bundles', () => {
  it('carries no feature code when it imports the core canvas and names no feature', async () => {
    const { code } = await consumer(LEAN);
    expect(code).toContain('react-flow__viewport'); // the canvas itself is there…
    for (const [feature, needles] of Object.entries(FEATURES)) {
      for (const needle of needles) {
        expect(code.includes(needle), `${feature}: found "${needle}"`).toBe(false);
      }
    }
  }, 60_000);

  it('carries them all when it imports the whole canvas', async () => {
    const { code } = await consumer(FULL);
    for (const [feature, needles] of Object.entries(FEATURES)) {
      if (feature === 'dev warnings') continue; // a production build drops them, for every canvas
      for (const needle of needles) {
        expect(code.includes(needle), `${feature}: missing "${needle}"`).toBe(true);
      }
    }
  }, 60_000);

  it('is a good deal smaller for it', async () => {
    const lean = await consumer(LEAN);
    const full = await consumer(FULL);
    expect(lean.gzip).toBeLessThan(full.gzip * 0.8);
  }, 60_000);

  it('does not carry components it never imports', async () => {
    const { code } = await consumer(LEAN);
    expect(code).not.toContain('Zoom in'); // <Controls>
    expect(code).not.toContain('flowinger-minimap'); // <MiniMap>
    expect(code).not.toContain('flowinger-resize'); // <NodeResizer>
  }, 60_000);

  it('does not carry the canvas for a hook that does not need it', async () => {
    const { code, gzip } = await consumer(['useKeyPress']);
    expect(code).not.toContain('react-flow__viewport');
    expect(gzip).toBeLessThan(1500);
  }, 60_000);
});
