import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The docs an assistant reads to answer a question about Flowinger, in the order a reader would want them.
// public/llms.txt is the hand-written index (llmstxt.org); this is the whole text behind it, rebuilt from
// docs/ on every deploy so it cannot drift from what the repository says.
const llmsFullDocs = [
  'README.md',
  'docs/getting-started.md',
  'docs/guides/org-chart.md',
  'docs/guides/dag-layout.md',
  'docs/guides/flowchart-editor.md',
  'docs/guides/export-png.md',
  'docs/guides/save-load-json.md',
  'docs/guides/nextjs-workflow.md',
  'docs/api.md',
  'docs/components.md',
  'docs/features.md',
  'docs/pro.md',
  'docs/theming.md',
  'docs/server-rendering.md',
  'docs/migrating-from-react-flow.md',
  'docs/react-flow-coverage.md',
  'docs/benchmarks.md',
];

function llmsFull(): Plugin {
  return {
    name: 'flowinger-llms-full',
    apply: 'build',
    generateBundle() {
      const body = llmsFullDocs
        .map((path) => `<!-- ${path} -->\n\n${readFileSync(path, 'utf8').trim()}\n`)
        .join('\n---\n\n');
      this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: body });
    },
  };
}

// The demo as a static site: the root index.html, which loads demo/main.tsx, built for GitHub Pages
// (`pnpm demo:build`, deployed by .github/workflows/pages.yml). It imports the library from `src`, so
// what is published there is the commit it was built from, not a release. public/ (llms.txt) is copied
// to the site's root.
//
// `base` is the path Pages serves a project site from; set DEMO_BASE for a custom domain or a preview.
export default defineConfig({
  base: process.env.DEMO_BASE ?? '/flowinger/',
  plugins: [react(), llmsFull()],
  build: { outDir: 'demo-dist', emptyOutDir: true },
});
