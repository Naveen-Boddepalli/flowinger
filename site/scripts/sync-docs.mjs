// Copies the repository's Markdown into the site's content collection, so each page is written once, where
// GitHub renders it, and this turns it into a site page: docs/*.md, the examples' README, the changelog,
// roadmap, contributing guide and design record. The copies are generated (and git-ignored); edit the files
// in the repository, never src/content/docs/ (apart from index.mdx, the home page, which lives there).
//
// What changes on the way:
// - the `# Heading` becomes the page's frontmatter title (Starlight draws it);
// - the "[← Documentation](README.md) · " breadcrumb in docs/ is dropped (the sidebar does that job), and what
//   follows it becomes the page's meta description;
// - a link to another published file points at its site page, an image in docs/assets at the site's copy,
//   and anything else (source files, the example apps) at GitHub.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(siteDir, '..');
const contentDir = join(siteDir, 'src/content/docs');
const assetsDir = join(siteDir, 'public/assets');

const base = (process.env.SITE_BASE ?? '/flowinger/').replace(/\/?$/, '/');
const github = 'https://github.com/Naveen-Boddepalli/flowinger';

// Repository path → site page (slug, and a title when the file's own heading is not the one to show).
const pages = new Map([
  ['docs/README.md', { slug: 'docs', title: 'Overview' }],
  ...readdirSync(join(repoDir, 'docs'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => [`docs/${file}`, { slug: `docs/${file.slice(0, -3)}` }]),
  ['examples/README.md', { slug: 'examples' }],
  ['CHANGELOG.md', { slug: 'changelog' }],
  ['ROADMAP.md', { slug: 'roadmap' }],
  ['CONTRIBUTING.md', { slug: 'contributing', title: 'Contributing' }],
  ['plan.md', { slug: 'design-record', title: 'Design record' }],
]);

function isDir(repoPath) {
  const full = join(repoDir, repoPath);
  return existsSync(full) && statSync(full).isDirectory();
}

// A link written in `from` (a repository path), as the site should have it.
function rewriteLink(target, from) {
  if (/^([a-z]+:|#|\/)/i.test(target)) return target;
  const [path, hash = ''] = target.split(/(?=#)/);
  const repoPath = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, '');
  if (repoPath === 'README.md') return `${base}${hash}`; // the repository's README is the home page
  const page = pages.get(repoPath) ?? (isDir(repoPath) ? pages.get(`${repoPath}/README.md`) : undefined);
  if (page) return `${base}${page.slug}/${hash}`;
  if (repoPath.startsWith('docs/assets/')) return `${base}assets/${repoPath.slice('docs/assets/'.length)}`;
  return `${github}/${isDir(repoPath) ? 'tree' : 'blob'}/main/${repoPath}${hash}`;
}

// Markdown links and images, reference definitions, and href/src in inline HTML — outside fenced code.
function rewriteLinks(markdown, from) {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line
        .replace(/\]\(([^)\s]+)\)/g, (_, target) => `](${rewriteLink(target, from)})`)
        .replace(/^(\s*\[[^\]]+\]:\s*)(\S+)/, (_, head, target) => head + rewriteLink(target, from))
        .replace(/\b(href|src)="([^"]+)"/g, (_, attr, target) => `${attr}="${rewriteLink(target, from)}"`);
    })
    .join('\n');
}

function plainText(markdown) {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function convert(repoPath, { slug, title }) {
  const lines = readFileSync(join(repoDir, repoPath), 'utf8').split('\n');
  const h1 = lines.findIndex((line) => /^# /.test(line));
  if (h1 === -1) throw new Error(`${repoPath} has no "# Title" heading`);
  let body = [...lines.slice(0, h1), ...lines.slice(h1 + 1)].join('\n').replace(/^\s+/, '');

  // The breadcrumb paragraph: "[← Documentation](README.md) · lead text…" up to the first blank line.
  let description;
  const crumb = body.match(/^\[← Documentation\]\(README\.md\)( · )?([\s\S]*?)(\n\s*\n|$)/);
  if (crumb) {
    const lead = crumb[2].trim();
    if (lead) description = plainText(lead);
    body = (lead ? `${lead}\n\n` : '') + body.slice(crumb[0].length);
  }

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title ?? lines[h1].slice(2).trim())}`,
    description && `description: ${JSON.stringify(description)}`,
    `editUrl: ${JSON.stringify(`${github}/edit/main/${repoPath}`)}`,
    '---',
    '',
    `<!-- Generated from ${repoPath} by site/scripts/sync-docs.mjs; edit that file instead. -->`,
    '',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  // .md, not .mdx: these are plain Markdown (GitHub renders them), and MDX would read their `{` and `<`.
  const out = join(contentDir, slug === 'docs' ? 'docs/index.md' : `${slug}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, frontmatter + rewriteLinks(body, repoPath));
}

// Everything in the collection but the hand-written home page is ours to replace.
for (const entry of readdirSync(contentDir)) {
  if (entry !== 'index.mdx') rmSync(join(contentDir, entry), { recursive: true, force: true });
}
pages.forEach((page, repoPath) => convert(repoPath, page));
rmSync(assetsDir, { recursive: true, force: true });
cpSync(join(repoDir, 'docs/assets'), assetsDir, { recursive: true });
console.log(`sync-docs: ${pages.size} pages → src/content/docs/, docs/assets → public/assets/`);
