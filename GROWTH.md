# Growth plan: getting Flowinger recommended

The goal is that when someone asks a person, a search engine or an AI assistant for a React node-graph
library, Flowinger is in the answer. In particular, it should be *the* answer when the app's diagram mostly
displays a graph and bundle size, dependencies or SSR matter.

## Where it stands (2026-10-13)

| | Flowinger | React Flow |
|---|---|---|
| npm downloads, last 30 days | ~1,070 | ~55.6M (`@xyflow/react`) + ~9.9M (`reactflow`) |
| GitHub stars | 0 | ~38,600 |
| GitHub description / topics | **none / none** | set |
| Age on npm | days (0.4.0 → 0.6.0 in Oct 2026) | years |

The engineering is already ahead of the visibility. The library covers all 211 React Flow exports, has
measured benchmarks, a migration guide, free "pro" modules and over 1,000 tests. Almost nobody can find
any of it. So the work below is mostly distribution, not code.

## How libraries get recommended

1. **AI assistants recommend what is popular and well documented.** Studies of ChatGPT's library
   choices found it favours mature, widely adopted, permissively licensed packages
   ([arXiv 2408.05128](https://arxiv.org/abs/2408.05128), [arXiv 2507.10818](https://arxiv.org/abs/2507.10818)).
   Training data comes from GitHub, npm, Stack Overflow, blogs, Reddit and HN. So assistants follow human
   adoption, with a lag of months. There is no shortcut. What we *can* do is (a) be present and accurate in
   those sources, and (b) give tool-using assistants that browse a clean, readable description
   ([llms.txt](https://llmstxt.org)) that states when to pick Flowinger.
2. **Developers find alternatives through comparison content.** People search "React Flow alternative",
   "React Flow bundle size" and "React Flow Pro free", or read AlternativeTo
   ([React Flow's page](https://alternativeto.net/software/react-flow/) lists Svelte Flow, JointJS and
   jsPlumb, but not Flowinger). Each of those is a place to show up.
3. **A sharp, provable wedge beats breadth.** "React Flow, but smaller" is weak by itself. These claims
   are each true, checkable and memorable:
   - **3× smaller diagram chunk in a real app** (60.5 → 19.0 kB gzipped), with **zero dependencies** and no CSS file.
   - **The React Flow Pro features, free and MIT:** undo/redo, copy-paste, helper lines, export, smart edges.
   - **2× faster mount and 3× cheaper pan/zoom** at 10k nodes without culling.
   - **Same API.** Migrating means changing an import.

   Lead with the second claim in communities where people build editors. Lead with the first where people
   ship viewers or care about performance budgets.

## The plan

### Phase 1: be findable and convincing (this week)

Done in this branch:
- [x] `llms.txt` at the site root and a generated `llms-full.txt` (every doc in one file, rebuilt on each deploy).
- [x] npm `description` and `keywords` that match what people search for ("React Flow alternative", "workflow editor"…).
- [x] A comparison table near the top of the README that includes the rows where React Flow wins.
- [x] One-click StackBlitz links for each example.
- [x] Demo page: a correct social card (`og:image`, Twitter card) and a fixed size claim (it said 16 kB).
- [x] Examples moved to `^0.6.0`. `^0.5.0` does not match 0.6.0, so StackBlitz would have run old code.

Needs you (GitHub settings and accounts):
- [ ] **Repository description and topics.** Today they are empty, which hides the repo from GitHub topic
      pages and search. Settings → General, or:
      `gh repo edit Naveen-Boddepalli/flowinger --description "A small, dependency-free React Flow alternative: React Flow's API in ~19 kB, free undo/redo, export and smart edges" --add-topic react,react-flow,react-flow-alternative,node-editor,flowchart,diagram,workflow-editor,graph,typescript,xyflow`
- [ ] **Social preview image** (Settings → Social preview). Use `docs/assets/demo.png` or a 1280×640 crop with the tagline.
- [ ] **Enable Discussions.** It gives questions a home that search engines index.
- [ ] Merge this branch so Pages redeploys and serves `/flowinger/llms.txt`.

### Phase 2: launch (one week, staggered, not all in one day)

Order matters. Each post sends people to a repo that already looks complete. Drafts are below.
1. **Write the article first** (dev.to, cross-post to Hashnode/Medium): *"We replaced React Flow and cut
   our diagram bundle from 60 kB to 19 kB"*. Real numbers, the trade-offs, and where React Flow still wins.
   Honest articles get shared and cited. This one is the anchor everything else links to.
2. **r/reactjs** "Show-off Saturday" or a regular post (read the subreddit rules first). Then r/javascript and r/webdev.
3. **Show HN** on a weekday morning US time. Stay in the thread for the first 3 hours and answer everything.
4. **Newsletters.** Submit to *This Week in React* (Sébastien Lorber), *React Status* and *JavaScript Weekly* (Cooperpress),
   and *Bytes*. One accepted newsletter often outweighs every social post.
5. **Directories.** Add it to AlternativeTo as an alternative to React Flow, and add the llms.txt to
   [llms-txt-hub](https://github.com/thedaviddias/llms-txt-hub). Open PRs to awesome-react,
   awesome-react-components and awesome-node-based-uis.
6. **X / Bluesky / LinkedIn.** A 20-second screen recording: open the demo, drag, connect, undo, export. Then the bundle-size number.

### Phase 3: compound (ongoing, the part that actually makes it "recommended")

- **Answer questions where they are asked.** Search Stack Overflow, GitHub Discussions in xyflow, and Reddit for
  "react flow bundle size", "react flow undo redo", "react flow SSR / Next.js", and "react flow pro free".
  Answer the question first. Mention Flowinger only where it fits, and disclose that you maintain it.
  Assistants learn heavily from these threads.
- **Recipes that rank.** One page or example per search intent: "React flowchart editor with undo/redo",
  "React workflow builder in Next.js", "React org chart", "Render a DAG in React with dagre", "React
  diagram export to PNG". All five now have a guide in [`docs/guides/`](docs/guides) and an example behind it.
- **A codemod** (`npx flowinger-migrate`) that rewrites `@xyflow/react` imports, removes the CSS import and adds
  the three `nodes*` props. Then "switching takes one command" is literally true.
- **Close the culled gap.** Drag is closed (4.3 ms against React Flow's 4.5 at 10,000 nodes); culled pan and
  zoom are left (4.4 / 5.0 against 3.1 / 3.2 ms). Then the comparison table has no performance row where
  React Flow wins, which is a headline in itself.
- **Get a second user.** QueryLens is the only public consumer. Open-source workflow tools that ship React
  Flow (n8n-like builders, LangGraph/agent UIs, data-lineage viewers) are the targets. Offer a PR that does the
  migration and measures the bundle win. A "used by" row with real names is the strongest trust signal.
- [x] **A docs site** with search ([`site/`](site), generated from `docs/`). Each doc page is a search landing page.
- **Release rhythm.** Keep up a steady minor-release cadence, and make each changelog entry worth a short post.

### What to measure

| Metric | Now | 3 months | 6 months |
|---|---|---|---|
| npm downloads / week | ~250 | 2,000 | 10,000 |
| GitHub stars | 0 | 500 | 1,500 |
| Dependent repos on GitHub | 1 | 10 | 50 |
| Assistants that name Flowinger for "lightweight React Flow alternative" | ? | 1 of 3 | 3 of 3 |

Check the last row monthly. Ask ChatGPT, Claude and Gemini (with and without web search) the same three
prompts and record the answers:
"What's a lightweight alternative to React Flow?", "React node editor with free undo/redo", and
"Smallest React library for rendering a DAG". Expect the browsing modes to move first and the base models
only after a training cycle.

### What not to do

- No fake stars, sockpuppet posts, or comments that don't disclose you're the author. Communities spot
  them, and it costs more trust than it ever gains.
- Don't drop the "Reach for React Flow instead when…" section. Admitting where it falls short is why the
  rest of the README is believable, and it is the kind of nuance assistants repeat.
- Don't post in xyflow's own issue tracker to advertise.

---

## Launch drafts

### Show HN

**Title:** Show HN: Flowinger – React Flow's API in 20 kB, with no dependencies

> I built Flowinger for QueryLens, a tool that draws SQL query plans. React Flow was most of its bundle, and
> it only needed the viewer part. Flowinger keeps React Flow's API (same component, hook, prop and type names,
> all 211 exports), but it is a small core plus opt-in features. A viewer pays about 20 kB gzipped and the
> full editor about 35 kB, with no dependencies and no stylesheet. In QueryLens the diagram chunk went from
> 60.5 kB to 19 kB.
>
> A few things I'd like feedback on:
> - Undo/redo, copy-paste, snap lines, PNG/SVG export and obstacle-avoiding edges are included free, as separate entry points.
> - Benchmarks against React Flow at 1k–10k nodes are reproducible with `pnpm bench`. Without culling it mounts
>   about 2× faster and pans about 3× cheaper. With culling on, React Flow is still faster at pan and zoom (Flowinger is faster at drag), and the README says so.
> - React Flow is the test oracle: geometry and behaviour are checked against it in over 1,000 tests.
>
> Site: https://naveen-boddepalli.github.io/flowinger/ · Demo: https://naveen-boddepalli.github.io/flowinger/demo/ · Code: https://github.com/Naveen-Boddepalli/flowinger
>
> It is 0.x and has one maintainer. If you have an app on React Flow, I'd love to hear what blocks a switch.

### r/reactjs

**Title:** I rebuilt React Flow's API in 20 kB with zero deps, and the "Pro" features are free

> (Same story in 5–6 lines. Embed the demo GIF. Link the comparison table and the migration guide. End with a
> question: "what would you need to see before switching?")

### Article outline: "We replaced React Flow and cut our diagram bundle from 60 kB to 19 kB"

1. The problem: a diagram viewer shipping a full editor's worth of code and a stylesheet.
2. What we kept: React Flow's API, so the swap was an import change. Show the diff.
3. How it's small: a core plus features (`FlowingerCore` + `dragFeature`…), no d3, and no CSS file.
4. Proof: the bundle numbers, the benchmark table (including where React Flow wins), and the test-oracle approach.
5. The free pro modules: undo/redo, export, smart edges, with code.
6. When *not* to switch: copy the "Is it for you?" section.
7. Try it: StackBlitz links and `npm i flowinger`.
