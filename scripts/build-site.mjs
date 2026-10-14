// Builds what GitHub Pages serves (`pnpm site:build`, deployed by .github/workflows/pages.yml): the
// documentation site from site/ at the root, and the demo under demo/. Both build from the repository's
// src/, so the deploy shows the commit it was built from. site/ has its own dependencies; install them once
// with `pnpm --dir site install`.
//
// SITE_BASE is the path Pages serves the project from (default /flowinger/); set it for a custom domain.
import { execSync } from 'node:child_process';
import { cpSync } from 'node:fs';

const base = (process.env.SITE_BASE ?? '/flowinger/').replace(/\/?$/, '/');
const run = (command, env = {}) => execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });

run('pnpm demo:build', { DEMO_BASE: `${base}demo/` });
run('pnpm --dir site build', { SITE_BASE: base });

cpSync('demo-dist', 'site/dist/demo', { recursive: true });
// llms.txt and llms-full.txt (made by the demo build from docs/) belong at the site's root.
for (const file of ['llms.txt', 'llms-full.txt']) cpSync(`demo-dist/${file}`, `site/dist/${file}`);
console.log('build-site: site/dist (site at the root, demo at demo/)');
