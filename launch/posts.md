# Launch posts

Everything here is to be posted by the author, from their own accounts, saying they are the author. Order and
spacing are in [GROWTH.md](../GROWTH.md#phase-2-launch-one-week-staggered-not-all-in-one-day): the dev.to
article ([`devto.md`](devto.md)) first, then these over a week. Replace `<article>` with its URL once it is up.

Numbers used below, so they stay the same everywhere — measured on 1.1.0, what `npm install flowinger` gives
(measure again if a later version is out when these are posted): diagram chunk 59.1 → 20.2 kB (QueryLens, React
Flow 12.11.6 against flowinger 1.1.0 in the same build); core ~21.3 kB, whole canvas ~38 kB gzipped; 0 dependencies; 210/210 exports, 119/119 props; at 10,000 nodes mount 0.6 s vs
1.2 s (culled: 53 ms vs 559), unculled pan 8.1 vs 32.7 ms a frame, culled zoom 1.7 vs 4.2 ms (culled pan 3.0 vs 3.9, close to noise).

---

## r/reactjs

Read the subreddit's rules first; self-promotion is allowed in moderation and on Saturdays in the
"Show-off Saturday" thread. Post as a text post with the demo GIF or the screenshot.

**Title:** I rebuilt React Flow's API in ~21 kB with no dependencies — and the "Pro" features are free

> I maintain QueryLens, which draws SQL query plans. React Flow was most of its bundle for a view that mostly
> *shows* a graph, so I wrote Flowinger: React Flow's API (all 210 exports, all 119 `ReactFlow` props), built
> as a small core plus opt-in features, with no dependencies and no stylesheet. Our diagram chunk went from
> 59.1 kB to 20.2 kB gzipped; switching was an import change plus three props, since interaction is off by default.
>
> Undo/redo, copy-paste, snap lines, PNG/SVG export and obstacle-avoiding edges are included, as separate
> entry points. Benchmarks against React Flow at 1k–10k nodes are reproducible (`pnpm bench`), including the
> rows where it was behind until this release.
>
> It's 1.0 but young, with one maintainer (me), and React Flow's ecosystem is far bigger — the README says when to stay on
> React Flow. What would you need to see before switching?
>
> Write-up: <article> · Docs + live editor: https://naveen-boddepalli.github.io/flowinger/ · Code: https://github.com/Naveen-Boddepalli/flowinger

For **r/javascript** and **r/webdev** a few days later, the same text with the first line changed to lead with
the bundle number ("A React node-graph library in 21 kB with zero dependencies").

---

## X / Bluesky

A thread. Attach a 20-second screen recording to the first post: open the site's live editor, drag a node,
connect two, undo, export a PNG.

> 1/ We cut our React diagram bundle from 59 kB to 20 kB by rebuilding React Flow's API from scratch.
>
> Flowinger: React Flow's components, hooks and props — 0 dependencies, no stylesheet, ~21 kB for a viewer.
> https://naveen-boddepalli.github.io/flowinger/

> 2/ How it stays small: a core that pans, zooms and draws, plus features you name — drag, connect, select,
> culling — each adding only its own code. A read-only viewer pays for none of the editing.

> 3/ Undo/redo, copy-paste, snap lines, PNG/SVG export and edges that route around nodes are free, as separate
> imports: `flowinger/history`, `flowinger/export`, `flowinger/smart-edges`…

> 4/ Benchmarked against React Flow at 10k nodes: with culling it mounts in 53 ms vs 559, because its first
> render is culled too; unculled it pans at 8.1 vs 33 ms a frame. The culled pan is close to a tie. Reproducible: `pnpm bench`.

> 5/ It's 1.0 but new, with one maintainer; React Flow's ecosystem is much bigger, and the docs say when to stay on it. Write-up with
> the trade-offs: <article>

---

## LinkedIn

> I rewrote the diagram layer of QueryLens and cut its bundle from 59.1 kB to 20.2 kB gzipped.
>
> The result is Flowinger, an open-source React library with React Flow's API — so switching was an import
> change — built as a small core plus opt-in features, with no dependencies. Undo/redo, export and smart edges
> come free. It is benchmarked against React Flow at up to 10,000 nodes, and the write-up includes where it
> was behind and how that was fixed.
>
> If your team draws workflows, pipelines or dependency graphs in React, I'd value your feedback: <article>

---

## Newsletters

One accepted newsletter often outweighs every social post. Submit the article URL, not the repository.

- **This Week in React** (Sébastien Lorber) — https://thisweekinreact.com, submission link on the site.
- **React Status** and **JavaScript Weekly** (Cooperpress) — reply to an issue or use the "submit a link" form.
- **Bytes** (ui.dev) — submission form on the site.

Blurb, under 50 words:

> **Flowinger** — React Flow's API in ~21 kB with no dependencies: a small core plus opt-in features, free
> undo/redo, export and smart edges, and server rendering. The write-up covers a 59 → 20 kB bundle cut,
> benchmarks against React Flow at 10k nodes, and when not to switch.

---

## Directories and lists

**AlternativeTo** — add Flowinger as an alternative to React Flow.
- Description: *A small, dependency-free React library for node-based diagrams and editors, with React Flow's
  API. Opt-in features keep a viewer near 21 kB gzipped; undo/redo, export and smart edges are included free.*
- Tags: react, diagram, flowchart, node-editor, open-source. License: MIT. Platforms: Web, Self-hosted.

**awesome-react**, **awesome-react-components**, **awesome-node-based-uis** — one pull request each, following
the list's own format and alphabetical order; read its CONTRIBUTING first. The line:

> [Flowinger](https://github.com/Naveen-Boddepalli/flowinger) - React Flow's API in ~21 kB with no dependencies; opt-in features, free undo/redo and export.

**llms-txt-hub** — add `https://naveen-boddepalli.github.io/flowinger/llms.txt` under developer tools /
libraries, following the repository's instructions.
