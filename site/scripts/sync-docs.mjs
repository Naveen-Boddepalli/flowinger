// Copies the repository's docs/*.md into the site's content collection, so docs/ stays the one place the
// documentation is written: GitHub renders it there, and this turns it into site pages. The copies are
// generated (and git-ignored); edit docs/, never src/content/docs/docs/.
//
// What changes on the way:
// - the `# Heading` becomes the page's frontmatter title (Starlight draws it);
// - the "[← Documentation](README.md) · " breadcrumb is dropped (the sidebar does that job), and what follows
//   it becomes the page's meta description;
// - links between docs point at site pages; links out of docs/ (examples, the changelog, source files)
//   point at GitHub, since the site does not publish them.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(siteDir, '..');
const docsDir = join(repoDir, 'docs');
const outDir = join(siteDir, 'src/content/docs/docs');

const base = (process.env.SITE_BASE ?? '/flowinger/').replace(/\/?$/, '/');
const github = 'https://github.com/Naveen-Boddepalli/flowinger';

function pageUrl(file, hash = '') {
  const slug = file === 'README.md' ? '' : `${file.replace(/\.md$/, '')}/`;
  return `${base}docs/${slug}${hash}`;
}

function rewriteLink(target) {
  if (/^([a-z]+:|#|\/)/i.test(target)) return target;
  const [path, hash = ''] = target.split(/(?=#)/);
  if (!path.startsWith('../')) {
    if (path.endsWith('.md') && existsSync(join(docsDir, path))) return pageUrl(path, hash);
    return `${github}/blob/main/docs/${path}${hash}`;
  }
  const repoPath = path.slice(3).replace(/\/$/, '');
  const isDir = existsSync(join(repoDir, repoPath)) && statSync(join(repoDir, repoPath)).isDirectory();
  return `${github}/${isDir ? 'tree' : 'blob'}/main/${repoPath}${hash}`;
}

// Inline links `[text](target)` and reference definitions `[id]: target`, outside fenced code.
function rewriteLinks(markdown) {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line
        .replace(/\]\(([^)\s]+)\)/g, (_, target) => `](${rewriteLink(target)})`)
        .replace(/^(\s*\[[^\]]+\]:\s*)(\S+)/, (_, head, target) => head + rewriteLink(target));
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

function convert(file) {
  const source = readFileSync(join(docsDir, file), 'utf8');
  const lines = source.split('\n');
  const h1 = lines.findIndex((line) => /^# /.test(line));
  if (h1 === -1) throw new Error(`docs/${file} has no "# Title" heading`);
  const title = file === 'README.md' ? 'Overview' : lines[h1].slice(2).trim();
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
    `title: ${JSON.stringify(title)}`,
    description && `description: ${JSON.stringify(description)}`,
    `editUrl: ${JSON.stringify(`${github}/edit/main/docs/${file}`)}`,
    '---',
    '',
    `<!-- Generated from docs/${file} by site/scripts/sync-docs.mjs; edit that file instead. -->`,
    '',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  // .md, not .mdx: the docs are plain Markdown (GitHub renders them), and MDX would read their `{` and `<`.
  const name = file === 'README.md' ? 'index.md' : file;
  writeFileSync(join(outDir, name), frontmatter + rewriteLinks(body));
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const files = readdirSync(docsDir).filter((file) => file.endsWith('.md'));
files.forEach(convert);
console.log(`sync-docs: ${files.length} pages from docs/ → src/content/docs/docs/`);
