// Copies the repository's Markdown into the site's content collection, so each page is written once, where
// GitHub renders it, and this turns it into a site page: docs/*.md and docs/guides/*.md, the examples' README, the changelog,
// roadmap, contributing guide and design record. The copies are generated (and git-ignored); edit the files
// in the repository, never src/content/docs/ (apart from index.mdx, the home page, which lives there).
//
// The 1.x docs go under v1/ the same way, read from the `v1` branch with git rather than from the working tree:
// its README (as /v1/), docs/, changelog and roadmap, with a banner on each page pointing at 2.x and docs/assets
// copied to public/v1/assets. src/v1-sidebar.ts gives those pages their own sidebar. The branch is `v1`, else
// `origin/v1`, else what SITE_V1_REF names; a clone without it fails here (`git fetch origin v1`).
//
// What changes on the way:
// - the `# Heading` becomes the page's frontmatter title (Starlight draws it);
// - the "[← Documentation](README.md) · " breadcrumb in docs/ is dropped (the sidebar does that job), and what
//   follows it becomes the page's meta description;
// - a link to another published file points at its site page, an image in docs/assets at the site's copy,
//   and anything else (source files, the example apps) at GitHub, on the branch the page came from.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(siteDir, '..');
const contentDir = join(siteDir, 'src/content/docs');
const publicDir = join(siteDir, 'public');

const base = (process.env.SITE_BASE ?? '/flowinger/').replace(/\/?$/, '/');
const github = 'https://github.com/Naveen-Boddepalli/flowinger';

// Where a version's files come from: the working tree, or a git ref.
const workingTree = {
  branch: 'main',
  list: (dir) => readdirSync(join(repoDir, dir)),
  read: (path) => readFileSync(join(repoDir, path), 'utf8'),
  isDir: (path) => existsSync(join(repoDir, path)) && statSync(join(repoDir, path)).isDirectory(),
  copyDir: (dir, to) => cpSync(join(repoDir, dir), to, { recursive: true }),
};

function gitRef(ref, branch) {
  const git = (...args) => execFileSync('git', args, { cwd: repoDir, maxBuffer: 1 << 28 });
  // "<mode> <type> <hash>\t<path>" for every file and directory in the ref.
  const entries = new Map(
    git('ls-tree', '-r', '-t', ref)
      .toString()
      .trim()
      .split('\n')
      .map((line) => {
        const [meta, path] = line.split('\t');
        return [path, meta.split(' ')[1]];
      }),
  );
  return {
    branch,
    list: (dir) => [...entries.keys()].filter((path) => posix.dirname(path) === dir).map((path) => posix.basename(path)),
    read: (path) => git('show', `${ref}:${path}`).toString(),
    isDir: (path) => entries.get(path) === 'tree',
    copyDir: (dir, to) => {
      for (const [path, type] of entries) {
        if (type !== 'blob' || !path.startsWith(`${dir}/`)) continue;
        const out = join(to, path.slice(dir.length + 1));
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, git('show', `${ref}:${path}`));
      }
    },
    lastUpdated: (path) => git('log', '-1', '--format=%cI', ref, '--', path).toString().trim() || undefined,
  };
}

function findV1Ref() {
  const candidates = process.env.SITE_V1_REF ? [process.env.SITE_V1_REF] : ['v1', 'origin/v1'];
  for (const ref of candidates) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: repoDir, stdio: 'ignore' });
      return ref;
    } catch {}
  }
  throw new Error(
    `sync-docs: no ${candidates.join(' or ')} to build the 1.x docs (/v1/) from; run \`git fetch origin v1\` first`,
  );
}

function docsPages(source, prefix) {
  return [
    ['docs/README.md', { slug: `${prefix}docs`, title: 'Overview', index: true }],
    ...source
      .list('docs')
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .map((file) => [`docs/${file}`, { slug: `${prefix}docs/${file.slice(0, -3)}` }]),
    ...source
      .list('docs/guides')
      .filter((file) => file.endsWith('.md'))
      .map((file) => [`docs/guides/${file}`, { slug: `${prefix}docs/guides/${file.slice(0, -3)}` }]),
  ];
}

// Repository path → site page (slug, and a title when the file's own heading is not the one to show).
const current = {
  source: workingTree,
  assets: 'assets',
  pages: new Map([
    ...docsPages(workingTree, ''),
    ['examples/README.md', { slug: 'examples' }],
    ['CHANGELOG.md', { slug: 'changelog' }],
    ['ROADMAP.md', { slug: 'roadmap' }],
    ['CONTRIBUTING.md', { slug: 'contributing', title: 'Contributing' }],
    ['plan.md', { slug: 'design-record', title: 'Design record' }],
  ]),
  home: '', // the repository's README is the hand-written home page
};

const v1Ref = findV1Ref();
const v1Source = gitRef(v1Ref, 'v1');
const v1 = {
  source: v1Source,
  assets: 'v1/assets',
  pages: new Map([
    ['README.md', { slug: 'v1', title: 'Flowinger 1.x', index: true }],
    ...docsPages(v1Source, 'v1/'),
    ['CHANGELOG.md', { slug: 'v1/changelog' }],
    ['ROADMAP.md', { slug: 'v1/roadmap' }],
  ]),
  home: 'v1/',
  frontmatter: (repoPath, { slug }) => {
    // The banner links to this page's 2.x counterpart when there is one.
    const twin = current.pages.get(repoPath)?.slug ?? (repoPath === 'README.md' ? '' : undefined);
    const latest = twin === undefined ? `${base}docs/` : `${base}${twin ? `${twin}/` : ''}`;
    const banner =
      `You’re reading the <strong>1.x</strong> docs, which get security, crash and regression fixes for six ` +
      `months after 2.0.0. <a href="${latest}">2.x is current</a>; ` +
      `<a href="${base}docs/upgrading/#upgrading-to-20">Upgrading to 2.0</a> says what changed.`;
    const lastUpdated = v1Source.lastUpdated(repoPath); // the generated copy has no history of its own
    return [
      `banner: ${JSON.stringify({ content: banner })}`,
      // Search finds 2.x; a 1.x page under a 2.x query would mislead more than it helps.
      'pagefind: false',
      lastUpdated && `lastUpdated: ${lastUpdated}`,
    ];
  },
};

// A link written in `from` (a repository path), as the site should have it.
function rewriteLink(target, from, version) {
  if (/^([a-z]+:|#|\/)/i.test(target)) return target;
  const { source, pages } = version;
  const [path, hash = ''] = target.split(/(?=#)/);
  const repoPath = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, '');
  if (repoPath === 'README.md' && !pages.has('README.md')) return `${base}${version.home}${hash}`;
  const page = pages.get(repoPath) ?? (source.isDir(repoPath) ? pages.get(`${repoPath}/README.md`) : undefined);
  if (page) return `${base}${page.slug}/${hash}`;
  if (repoPath.startsWith('docs/assets/')) return `${base}${version.assets}/${repoPath.slice('docs/assets/'.length)}`;
  return `${github}/${source.isDir(repoPath) ? 'tree' : 'blob'}/${source.branch}/${repoPath}${hash}`;
}

// Markdown links and images, reference definitions, and href/src in inline HTML — outside fenced code.
function rewriteLinks(markdown, from, version) {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line
        .replace(/\]\(([^)\s]+)\)/g, (_, target) => `](${rewriteLink(target, from, version)})`)
        .replace(/^(\s*\[[^\]]+\]:\s*)(\S+)/, (_, head, target) => head + rewriteLink(target, from, version))
        .replace(/\b(href|src)="([^"]+)"/g, (_, attr, target) => `${attr}="${rewriteLink(target, from, version)}"`);
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

function convert(repoPath, page, version) {
  const { slug, title, index } = page;
  const lines = version.source.read(repoPath).split('\n');
  const h1 = lines.findIndex((line) => /^# /.test(line));
  let body;
  if (h1 !== -1) body = [...lines.slice(0, h1), ...lines.slice(h1 + 1)].join('\n').replace(/^\s+/, '');
  else if (title) body = lines.filter((line) => !/^\s*<h1\b.*<\/h1>\s*$/.test(line)).join('\n'); // a README's <h1>
  else throw new Error(`${repoPath} has no "# Title" heading`);

  // The breadcrumb paragraph: "[← Documentation](README.md) · lead text…" up to the first blank line.
  let description;
  const crumb = body.match(/^\[← Documentation\]\((?:\.\.\/)?README\.md\)( · )?([\s\S]*?)(\n\s*\n|$)/);
  if (crumb) {
    const lead = crumb[2].trim();
    if (lead) description = plainText(lead);
    body = (lead ? `${lead}\n\n` : '') + body.slice(crumb[0].length);
  }

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title ?? lines[h1].slice(2).trim())}`,
    description && `description: ${JSON.stringify(description)}`,
    `editUrl: ${JSON.stringify(`${github}/edit/${version.source.branch}/${repoPath}`)}`,
    ...(version.frontmatter?.(repoPath, page) ?? []),
    '---',
    '',
    `<!-- Generated from ${repoPath} by site/scripts/sync-docs.mjs; edit that file instead. -->`,
    '',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  // .md, not .mdx: these are plain Markdown (GitHub renders them), and MDX would read their `{` and `<`.
  const out = join(contentDir, index ? `${slug}/index.md` : `${slug}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, frontmatter + rewriteLinks(body, repoPath, version));
}

// Everything in the collection but the hand-written home page is ours to replace.
for (const entry of readdirSync(contentDir)) {
  if (entry !== 'index.mdx') rmSync(join(contentDir, entry), { recursive: true, force: true });
}
for (const dir of ['assets', 'v1']) rmSync(join(publicDir, dir), { recursive: true, force: true });
for (const version of [current, v1]) {
  version.pages.forEach((page, repoPath) => convert(repoPath, page, version));
  version.source.copyDir('docs/assets', join(publicDir, version.assets));
}
console.log(
  `sync-docs: ${current.pages.size} pages → src/content/docs/, ${v1.pages.size} from ${v1Ref} → ` +
    'src/content/docs/v1/, and their docs/assets → public/',
);
