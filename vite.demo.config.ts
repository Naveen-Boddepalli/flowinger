import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The demo as a static site: the root index.html, which loads demo/main.tsx, built for GitHub Pages
// (`pnpm demo:build`, deployed by .github/workflows/pages.yml). It imports the library from `src`, so
// what is published there is the commit it was built from, not a release.
//
// `base` is the path Pages serves a project site from; set DEMO_BASE for a custom domain or a preview.
export default defineConfig({
  base: process.env.DEMO_BASE ?? '/flowinger/',
  plugins: [react()],
  build: { outDir: 'demo-dist', emptyOutDir: true },
});
