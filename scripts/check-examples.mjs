// Builds each example in examples/ against the package as a consumer would install it.
//
// An example's package.json asks for `flowinger` from the registry, so that "Open in StackBlitz" and a
// copied folder both work. Here the same folder is copied to a throwaway directory with that dependency
// pointed at a freshly packed tarball, installed, type-checked and built — so an example that stops
// compiling against the library fails the pull request that broke it.
//
//   pnpm build && node scripts/check-examples.mjs [example …]     # all of them, or the ones named
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const examplesDir = join(root, 'examples');
const scratch = mkdtempSync(join(tmpdir(), 'flowinger-examples-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}\n${out}`);
  }
  return result.stdout;
}

const all = readdirSync(examplesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const wanted = process.argv.slice(2);
const names = wanted.length > 0 ? wanted : all;
const unknown = names.filter((n) => !all.includes(n));
if (unknown.length > 0) {
  console.error(`no such example: ${unknown.join(', ')} (have: ${all.join(', ')})`);
  process.exit(2);
}

let failed = false;
try {
  // `--ignore-scripts`: dist/ is already built, and `prepare` would build it again.
  const packed = run('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', scratch], root)
    .trim()
    .split('\n')
    .pop();
  const tarball = join(scratch, packed);

  for (const name of names) {
    const dir = join(scratch, name);
    cpSync(join(examplesDir, name), dir, {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|dist)([\\/]|$)/.test(src),
    });
    const manifestPath = join(dir, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!manifest.dependencies?.flowinger) {
      throw new Error(`examples/${name}/package.json does not depend on flowinger`);
    }
    manifest.dependencies.flowinger = `file:${tarball}`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    try {
      run('pnpm', ['install', '--no-frozen-lockfile'], dir);
      run('pnpm', ['run', 'build'], dir);
      console.log(`ok    examples/${name}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL  examples/${name}\n${error.message}\n`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
