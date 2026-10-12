// Flowinger and React Flow, the same graph, in a real browser — and the numbers, from this machine.
//
//   pnpm bench                     the whole matrix, 5 runs each (a quarter of an hour)
//   pnpm bench --n 1000 --runs 1   a quick look
//   pnpm bench --dry               print the table; write nothing
//   E2E_CHANNEL=chrome pnpm bench  use an installed Chrome instead of Playwright's Chromium
//
// For each library, graph size and `onlyRenderVisibleElements` setting it opens a clean page and measures:
//   mount     from the render until the document last changed — the nodes, handles and edges all there
//   pan, zoom main-thread milliseconds per frame, over 150 frames of one wheel event each
//   drag      main-thread milliseconds per mouse move, over 60 moves of one node
//   heap      JS heap after a collection, once mounted
// and what is in the document: nodes, and every element.
//
// It writes `bench/results.json`, and the table and the machine between the markers in `docs/benchmarks.md` —
// the prose around them is written by a person, from what the numbers say.
//
// Medians of the runs. The page is `bench/` — one bundle with both libraries, built for production — and the
// graph is a grid of nodes, each joined to the next in its row, with a custom node (a box and two handles)
// in both. Read docs/benchmarks.md before quoting a number: one machine, one browser, no throttling.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const root = resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};
const sizes = arg('n', '') ? [Number(arg('n'))] : [1000, 5000, 10000];
const runs = Number(arg('runs', 5));
const libs = ['flowinger', 'reactflow'];
// `--dry`: print the table, and leave bench/results.json and the docs alone.
const write = !process.argv.includes('--dry');

await build({ configFile: resolve(root, 'vite.bench.config.ts'), logLevel: 'warn' });
const server = await preview({
  configFile: resolve(root, 'vite.bench.config.ts'),
  logLevel: 'warn',
  preview: { port: 4189, strictPort: true, open: false },
});
const base = `http://localhost:4189/`;

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--enable-precise-memory-info'],
});

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** Main-thread seconds spent so far, from the browser's own counters. */
async function busy(client) {
  const { metrics } = await client.send('Performance.getMetrics');
  const get = (name) => metrics.find((m) => m.name === name)?.value ?? 0;
  return { task: get('TaskDuration'), heap: get('JSHeapUsedSize') };
}

async function session(lib, n, cull) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(600_000);
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  await page.goto(`${base}?lib=${lib}&n=${String(n)}&cull=${cull ? '1' : '0'}`);
  await page.waitForFunction(() => Boolean(window.__bench));
  const out = {};
  try {
    Object.assign(out, await page.evaluate(() => window.__bench.mount()));
    await client.send('HeapProfiler.collectGarbage');
    out.heapMB = (await busy(client)).heap / 1e6;

    // A drag: 60 mouse moves, on the node at the top-left corner — before the view is moved.
    const start = await page.evaluate(() => window.__bench.where('n0'));
    out.dragWorked = false;
    if (start) {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.evaluate(() => window.__bench.recordStart());
      const t0 = await busy(client);
      await page.mouse.move(start.x + 180, start.y + 120, { steps: 60 });
      const t1 = await busy(client);
      await page.mouse.up();
      out.drag = await page.evaluate(() => window.__bench.recordStop());
      out.dragMs = ((t1.task - t0.task) * 1000) / 60;
      const end = await page.evaluate(() => window.__bench.where('n0'));
      out.dragWorked = Boolean(end) && Math.abs(end.x - start.x) > 50;
    }

    // 150 frames of the wheel panning, then of a pinch zooming: main-thread time per frame.
    const p0 = await busy(client);
    out.pan = await page.evaluate(() => window.__bench.pan());
    const p1 = await busy(client);
    out.panMs = ((p1.task - p0.task) * 1000) / out.pan.frames;
    out.zoom = await page.evaluate(() => window.__bench.zoom());
    const p2 = await busy(client);
    out.zoomMs = ((p2.task - p1.task) * 1000) / out.zoom.frames;
  } catch (error) {
    out.error = String(error).split('\n')[0];
  } finally {
    await context.close();
  }
  return out;
}

const results = [];
for (const n of sizes) {
  for (const cull of [false, true]) {
    for (const lib of libs) {
      const all = [];
      for (let r = 0; r < runs; r++) {
        process.stdout.write(`${lib} n=${String(n)} cull=${String(cull)} run ${String(r + 1)}/${String(runs)} … `);
        const one = await session(lib, n, cull);
        all.push(one);
        console.log(one.error ?? `${one.mountMs.toFixed(0)} ms, ${String(one.nodesInDom)} nodes`);
      }
      const ok = all.filter((o) => !o.error);
      const m = (pick) => median(ok.map(pick));
      results.push({
        lib,
        n,
        cull,
        runs: ok.length,
        failed: all.length - ok.length,
        mountMs: m((o) => o.mountMs),
        nodesInDom: m((o) => o.nodesInDom),
        domElements: m((o) => o.domElements),
        panMs: m((o) => o.panMs),
        panDropped: m((o) => o.pan.dropped),
        panMoved: ok.every((o) => o.pan.moved),
        zoomMs: m((o) => o.zoomMs),
        zoomDropped: m((o) => o.zoom.dropped),
        zoomMoved: ok.every((o) => o.zoom.scaled),
        dragMs: m((o) => o.dragMs),
        dragDropped: m((o) => o.drag?.dropped ?? 0),
        dragWorked: ok.every((o) => o.dragWorked),
        heapMB: m((o) => o.heapMB),
      });
    }
  }
}

const version = await browser.version();
await browser.close();
server.httpServer.close();

const commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
const rf = JSON.parse(readFileSync(resolve(root, 'node_modules/@xyflow/react/package.json'), 'utf8')).version;
const own = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const machine = {
  date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD, where this is run
  cpu: os.cpus()[0]?.model ?? 'unknown',
  cores: os.cpus().length,
  memoryGB: Math.round(os.totalmem() / 1e9),
  platform: `${os.platform()} ${os.release()}`,
  chrome: version,
  node: process.version,
  flowinger: `${own} @ ${commit}`,
  reactflow: rf,
  runs,
};
if (write) writeFileSync(resolve(root, 'bench/results.json'), `${JSON.stringify({ machine, results }, null, 2)}\n`);

const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const row = (r) =>
  `| ${r.lib === 'flowinger' ? 'Flowinger' : 'React Flow'} | ${r.n.toLocaleString('en')} | ${r.cull ? 'on' : 'off'} | ` +
  (r.runs === 0
    ? 'failed | | | | | | | |'
    : `${f(r.mountMs, 0)} | ${String(r.nodesInDom)} | ${String(r.domElements)} | ` +
      `${r.panMoved ? f(r.panMs) : 'n/a'} | ${r.zoomMoved ? f(r.zoomMs) : 'n/a'} | ` +
      `${r.dragWorked ? f(r.dragMs) : 'n/a'} | ${f(r.heapMB, 0)} |`);
const table = [
  '| Library | Nodes | Culling | Mount (ms) | Nodes in DOM | DOM elements | Pan (ms/frame) | Zoom (ms/frame) | Drag (ms/move) | JS heap (MB) |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...results.sort((a, b) => a.n - b.n || Number(a.cull) - Number(b.cull) || a.lib.localeCompare(b.lib)).map(row),
].join('\n');
console.log(`\n${table}\n`);
console.log(JSON.stringify(machine));

const facts = [
  `Measured ${machine.date} on ${machine.cpu} (${String(machine.cores)} cores, ${String(machine.memoryGB)} GB), ${machine.platform},`,
  `Chrome ${machine.chrome}, Node ${machine.node}. Flowinger ${machine.flowinger}; React Flow (\`@xyflow/react\`) ${machine.reactflow}.`,
  `Median of ${String(machine.runs)} runs each.`,
].join(' ');
const docs = resolve(root, 'docs/benchmarks.md');
if (write && existsSync(docs)) {
  const text = readFileSync(docs, 'utf8');
  const open = '<!-- bench:table -->';
  const close = '<!-- /bench:table -->';
  if (text.includes(open) && text.includes(close)) {
    const next =
      text.slice(0, text.indexOf(open) + open.length) +
      `\n\n${facts}\n\n${table}\n\n` +
      text.slice(text.indexOf(close));
    writeFileSync(docs, next);
    console.log('updated docs/benchmarks.md');
  }
}
