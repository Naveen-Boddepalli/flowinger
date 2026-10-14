// The documentation site: a landing page plus docs/ rendered as pages (scripts/sync-docs.mjs copies them in),
// served from GitHub Pages beside the demo. `pnpm site:build` at the repository root builds both and puts the
// demo at <base>demo/.
import { fileURLToPath } from 'node:url';
import { defineConfig, passthroughImageService } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';

const base = process.env.SITE_BASE ?? '/flowinger/';
const github = 'https://github.com/Naveen-Boddepalli/flowinger';

export default defineConfig({
  site: 'https://naveen-boddepalli.github.io',
  base,
  // The only images are SVGs, which need no optimizing (and so no Sharp).
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: 'Flowinger',
      description:
        'A small, dependency-free node-graph renderer for React with React Flow’s API: HTML nodes over SVG edges, about 20 kB gzipped, server rendering, and free undo/redo, export and smart edges.',
      logo: { src: './src/assets/icon.svg' },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: github },
        { icon: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/flowinger' },
      ],
      head: [
        { tag: 'link', attrs: { rel: 'alternate', type: 'text/plain', title: 'llms.txt', href: `${base}llms.txt` } },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://raw.githubusercontent.com/Naveen-Boddepalli/flowinger/main/docs/assets/demo.png',
          },
        },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      ],
      customCss: ['./src/styles/site.css'],
      lastUpdated: true,
      // The same groups as docs/README.md.
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', link: '/docs/' },
            { label: 'Getting started', link: '/docs/getting-started/' },
            { label: 'Live demo', link: '/demo/', attrs: { target: '_blank' } },
            { label: 'Examples', link: `${github}/tree/main/examples` },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API reference', link: '/docs/api/' },
            { label: 'Components and hooks', link: '/docs/components/' },
            { label: 'Features', link: '/docs/features/' },
            { label: 'The "pro" modules', link: '/docs/pro/' },
            { label: 'Theming', link: '/docs/theming/' },
            { label: 'Server rendering', link: '/docs/server-rendering/' },
          ],
        },
        {
          label: 'Coming from React Flow',
          items: [
            { label: 'Migrating from React Flow', link: '/docs/migrating-from-react-flow/' },
            { label: 'React Flow coverage', link: '/docs/react-flow-coverage/' },
            { label: 'Benchmarks', link: '/docs/benchmarks/' },
          ],
        },
        {
          label: 'Project',
          items: [
            { label: 'Changelog', link: `${github}/blob/main/CHANGELOG.md` },
            { label: 'Roadmap', link: `${github}/blob/main/ROADMAP.md` },
            { label: 'Contributing', link: `${github}/blob/main/CONTRIBUTING.md` },
          ],
        },
      ],
    }),
    react(),
  ],
  vite: {
    resolve: {
      // The live examples run the library from the repository's src/, the way the demo does, so the site
      // shows the commit it was built from. One React for both: src/ would otherwise find the root's copy.
      alias: { flowinger: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
      dedupe: ['react', 'react-dom'],
    },
    server: { fs: { allow: ['..'] } },
  },
});
