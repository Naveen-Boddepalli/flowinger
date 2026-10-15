---
title: We replaced React Flow and cut our diagram bundle from 60 kB to 19 kB
published: false
description: How a small, dependency-free reimplementation of React Flow's API took QueryLens's diagram chunk from 60.5 kB to 19 kB gzipped — the numbers, the trade-offs, and where React Flow is still the better choice.
tags: react, javascript, webdev, opensource
cover_image: https://raw.githubusercontent.com/Naveen-Boddepalli/flowinger/main/docs/assets/demo.png
---

[QueryLens](https://github.com/Naveen-Boddepalli/QueryLens) draws SQL query plans: scans, joins and filters as
boxes, joined by arrows. It used [React Flow](https://reactflow.dev), which is excellent — and which was also
most of the page's JavaScript. The diagram chunk was **60.5 kB gzipped**, plus a stylesheet, for a view that
mostly *shows* a graph.

So I wrote [Flowinger](https://github.com/Naveen-Boddepalli/flowinger): React Flow's API, built as a small core
with opt-in features and no dependencies. In QueryLens the diagram chunk went to **19.0 kB**. This post is how,
what it cost, and when you should not do the same. (I'm the author, so read the numbers as a maintainer's — they
are all reproducible, and the commands are below.)

## The swap was an import change

The point of keeping React Flow's API was that switching should not be a rewrite. Flowinger names all 211 of
`@xyflow/react`'s exports and implements all 119 of its `ReactFlow` props, measured from React Flow's own type
declarations. For QueryLens the change was:

```diff
- import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react';
- import '@xyflow/react/dist/style.css';
+ import { ReactFlow, Background, Controls, Handle, Position } from 'flowinger';
```

There is no stylesheet: the built-in nodes, edges and controls are styled inline from `--flowinger-*` CSS
variables, and the `react-flow__*` class names are kept, so existing CSS that selects on them still works.

One thing a compiler will not tell you: **some defaults differ.** React Flow makes nodes draggable, connectable
and selectable unless you say otherwise; Flowinger's own canvas does the reverse, because a viewer — the common
case — wants none of it. A few more differ too (`minZoom`, the `fitView` margin, some key codes). For code coming
from React Flow, one spread gives a canvas React Flow's value for each of them:

```tsx
import { ReactFlow, reactFlowDefaults } from 'flowinger';

<ReactFlow {...reactFlowDefaults} nodes={nodes} edges={edges} />
```

In development, a `<ReactFlow>` that leaves any of them out says which. From 1.0, `<ReactFlow>` applies them
itself — so changing the import really is the whole swap — while `FlowingerCanvas` keeps the viewer-first ones.
The [migration guide](https://naveen-boddepalli.github.io/flowinger/docs/migrating-from-react-flow/) lists every
default that differs, each read from React Flow's source rather than from memory.

## How it is small

Three decisions do most of the work.

**A core, plus features you name.** The canvas that pans, zooms and draws nodes and edges is about 19.7 kB
gzipped. Dragging, connecting, box selection, deleting, keyboard access, culling and the rest are *features*,
each adding only its own code:

```tsx
import { FlowingerCore, dragFeature, connectFeature } from 'flowinger';

<FlowingerCore
  nodes={nodes}
  edges={edges}
  features={[dragFeature, connectFeature]}
  nodesDraggable
  nodesConnectable
/>
```

`FlowingerCanvas` (alias `ReactFlow`) includes every feature, at about 35.5 kB. A read-only viewer like
QueryLens's uses the core and pays for nothing it doesn't do.

**No dependencies.** `react` and `react-dom` (18 or 19) are the only peers. Pan and zoom are plain pointer and
wheel handling rather than `d3-zoom`; there is no state library underneath.

**No stylesheet.** Inline styles read CSS variables with fallbacks, so there is no CSS file to ship, import or
override.

## The numbers

Bundle, in a real app (QueryLens's diagram chunk, gzipped):

| | Flowinger | React Flow 12 |
|---|---|---|
| Diagram chunk | **19.0 kB** | 60.5 kB |
| Runtime dependencies | **0** | 3 direct, plus d3 modules through `@xyflow/system` |
| Stylesheet to import | **none** | `@xyflow/react/dist/style.css` |

Performance, at 10,000 nodes, Chrome on an Apple M4, median of 5 runs ([full table](https://naveen-boddepalli.github.io/flowinger/docs/benchmarks/)):

| | Flowinger | React Flow 12 |
|---|---|---|
| Mount, no culling | **0.6 s** | 1.2 s |
| Mount, culled | **55 ms** | 594 ms |
| Pan / zoom, no culling | **8.5 / 10.7 ms** a frame | 32.6 / 33.0 ms |
| Pan / zoom, culled | **3.6 / 2.5 ms** a frame | 4.2 / 4.7 ms |
| Drag, culled | **4.0 ms** a move | 4.8 ms |
| JS heap, no culling | **169 MB** | 254 MB |

Two honest notes on that table. First, the culled pan is a tie, not a win: across three runs on the same day
React Flow's read between 2.6 and 4.2 ms, and Flowinger's 3.1 to 3.6. The culled zoom is about half React
Flow's cost in every run, and a culled mount about a tenth: both libraries draw only what is in view in the end,
but React Flow's first render draws every node first. Second, until 0.7.0 React Flow was ahead on culled pan and zoom — the benchmark
found why (Flowinger re-checked every node on every frame of a pan), and 0.7.0 fixed it: while the view stays
inside the region last worked out, a frame costs nothing. That is the kind of thing a published benchmark is
for.

Re-run it yourself: `pnpm bench` in the repository builds one page with both libraries and measures them in a
real browser.

## Is it correct, though?

Small and fast is easy if you skip the hard parts. The tests use **React Flow as the oracle**: for geometry and
behaviour, the expected answer is what React Flow produces for the same input. There are 1,130 unit tests, a real-browser suite (29 tests in Chrome covering dragging, connecting,
wheel zoom about the pointer, export and more), and CI installs the *packed* package and builds nine example
apps against it — so a broken export map fails a pull request, not your build.

## The "Pro" features are free

React Flow sells a Pro subscription with examples for undo/redo, copy and paste, helper lines and so on.
Flowinger ships those as separate entry points, so they cost nothing unless you import them:

```tsx
import { useUndoRedo } from 'flowinger/history';
import { exportCanvasToPng, downloadFile } from 'flowinger/export';

const { undo, redo, takeSnapshot } = useUndoRedo({ enableShortcuts: true }); // Ctrl/⌘+Z, Ctrl/⌘+Shift+Z

<ReactFlow
  onNodeDragStart={() => takeSnapshot()}   // snapshot *before* a change
  onBeforeDelete={(els) => { takeSnapshot(); return els; }}
  /* … */
/>

const png = await exportCanvasToPng(wrapperElement, { pixelRatio: 2 });
downloadFile(png, 'diagram.png');
```

Also included: copy/cut/paste (`flowinger/clipboard`), snap guides (`flowinger/snaplines`), edges that route
around nodes (`flowinger/smart-edges`), editable edges, flowchart shapes, and a collapsible tree.

## When not to switch

Use React Flow instead if:

- **You need its ecosystem.** React Flow has years of examples, templates, answers on Stack Overflow and a team
  behind it. Flowinger is new, has one maintainer, and is `0.x` — a minor release can still change the API
  (the changelog says when).
- **You rely on behaviour that differs on purpose.** A few things are deliberately not React Flow's: the
  defaults above, `useStore` reading ten documented fields rather than the whole internal store, and the
  instance not being generic. The [coverage page](https://naveen-boddepalli.github.io/flowinger/docs/react-flow-coverage/)
  lists them all.
- **You want layout.** Neither library lays a graph out; you feed positions from `dagre`, `elkjs` or
  `d3-hierarchy`. (There's a [guide](https://naveen-boddepalli.github.io/flowinger/docs/guides/dag-layout/).)

Reach for Flowinger when your app *draws a graph* — a query plan, a workflow, a dependency map, an org chart —
and the bundle, the dependencies or server rendering matter.

## Try it

```bash
npm install flowinger
```

- **Docs and live editor:** https://naveen-boddepalli.github.io/flowinger/
- **Demo:** https://naveen-boddepalli.github.io/flowinger/demo/
- **Examples you can open in the browser** (StackBlitz): an [editor with undo](https://stackblitz.com/github/Naveen-Boddepalli/flowinger/tree/main/examples/editor),
  [Next.js with server rendering](https://stackblitz.com/github/Naveen-Boddepalli/flowinger/tree/main/examples/nextjs),
  [export to PNG/SVG](https://stackblitz.com/github/Naveen-Boddepalli/flowinger/tree/main/examples/export),
  [multiplayer with Yjs](https://stackblitz.com/github/Naveen-Boddepalli/flowinger/tree/main/examples/presence),
  [swimlanes](https://stackblitz.com/github/Naveen-Boddepalli/flowinger/tree/main/examples/swimlanes) and more.
- **Code:** https://github.com/Naveen-Boddepalli/flowinger (MIT)

If you have an app on React Flow, I'd like to hear what would stop you switching — that list decides what gets
built next.
