// The sidebar of the 1.x pages under /v1/ (scripts/sync-docs.mjs makes them from the `v1` branch): 1.x's own
// groups, from the v1 branch's astro.config.mjs, with links to its pages instead of 2.x's. Starlight has one
// sidebar for the whole site, so this swaps it per page, along with the previous/next links drawn from it.
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

type Link = [label: string, slug: string];
const v1Sidebar: { label: string; items: Link[] }[] = [
  {
    label: 'Flowinger 1.x',
    items: [
      ['Home', ''],
      ['Overview', 'docs'],
      ['Getting started', 'docs/getting-started'],
    ],
  },
  {
    label: 'Guides',
    items: [
      ['An org chart', 'docs/guides/org-chart'],
      ['Lay out a DAG with dagre', 'docs/guides/dag-layout'],
      ['A flowchart editor with undo', 'docs/guides/flowchart-editor'],
      ['Export to PNG or SVG', 'docs/guides/export-png'],
      ['Save and load as JSON', 'docs/guides/save-load-json'],
      ['A workflow builder in Next.js', 'docs/guides/nextjs-workflow'],
    ],
  },
  {
    label: 'Reference',
    items: [
      ['API reference', 'docs/api'],
      ['Components and hooks', 'docs/components'],
      ['Features', 'docs/features'],
      ['The "pro" modules', 'docs/pro'],
      ['Theming', 'docs/theming'],
      ['Server rendering', 'docs/server-rendering'],
      ['Accessibility', 'docs/accessibility'],
      ['What 1.0 promises', 'docs/stability'],
      ['Upgrading', 'docs/upgrading'],
    ],
  },
  {
    label: 'Coming from React Flow',
    items: [
      ['Migrating from React Flow', 'docs/migrating-from-react-flow'],
      ['React Flow coverage', 'docs/react-flow-coverage'],
      ['Benchmarks', 'docs/benchmarks'],
    ],
  },
  {
    label: 'Project',
    items: [
      ['Changelog', 'changelog'],
      ['Roadmap', 'roadmap'],
    ],
  },
];

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  if (route.id !== 'v1' && !route.id.startsWith('v1/')) return;

  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const link = (label: string, href: string, isCurrent = false) => ({
    type: 'link' as const,
    label,
    href,
    isCurrent,
    badge: undefined,
    attrs: {},
  });
  const pages = v1Sidebar.map(({ label, items }) => ({
    type: 'group' as const,
    label,
    collapsed: false,
    badge: undefined,
    entries: items.map(([label, slug]) => link(label, `${base}v1/${slug ? `${slug}/` : ''}`, `v1${slug ? `/${slug}` : ''}` === route.id)),
  }));
  route.sidebar = [link('← 2.x docs (current)', `${base}docs/`), ...pages];

  const flat = pages.flatMap((group) => group.entries);
  const at = flat.findIndex((entry) => entry.isCurrent);
  route.pagination = at === -1 ? { prev: undefined, next: undefined } : { prev: flat[at - 1], next: flat[at + 1] };
});
