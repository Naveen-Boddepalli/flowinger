# Benchmarks

Flowinger and React Flow (`@xyflow/react`) drawing the same graph, in the same page, in a real browser — what
it costs to put 1,000, 5,000 and 10,000 nodes on the screen, to pan and zoom over them, and to drag one.

**In short.** Without culling Flowinger mounts 1.6–1.9× as fast, costs 1.4–3.3× less to pan and zoom, and
holds about a third less memory; dragging a node costs the same or a little less. With
`onlyRenderVisibleElements` on, both libraries stay inside a 60 Hz frame at 10,000 nodes: mounting and dragging
are level, and React Flow is ahead at panning and zooming — by 1.1–1.6×, 0.2–1.8 ms a frame — which is the part
Flowinger has yet to close.

The numbers are from one machine and are meant to be **compared with each other, not quoted on their own**:
read [what this does not show](#what-this-does-not-show) before you do. Everything here is reproducible —
`pnpm bench` re-runs it, and [`bench/results.json`](../bench/results.json) holds what the table below was made
from.

## Results

<!-- bench:table -->

Measured 2026-10-14 on Apple M4 (10 cores, 17 GB), darwin 27.0.0, Chrome 155.0.8059.40, Node v24.16.0. Flowinger 0.7.0 @ 27d3b2e; React Flow (`@xyflow/react`) 12.11.6. Median of 5 runs each.

| Library | Nodes | Culling | Mount (ms) | Nodes in DOM | DOM elements | Pan (ms/frame) | Zoom (ms/frame) | Drag (ms/move) | JS heap (MB) |
|---|---|---|---|---|---|---|---|---|---|
| Flowinger | 1,000 | off | 82 | 1000 | 5955 | 3.7 | 3.1 | 6.8 | 20 |
| React Flow | 1,000 | off | 130 | 1000 | 7892 | 4.6 | 4.4 | 7.0 | 28 |
| Flowinger | 1,000 | on | 41 | 135 | 829 | 2.6 | 2.6 | 3.4 | 6 |
| React Flow | 1,000 | on | 83 | 96 | 788 | 3.4 | 3.6 | 3.1 | 7 |
| Flowinger | 5,000 | off | 309 | 5000 | 29877 | 6.1 | 7.3 | 37.8 | 86 |
| React Flow | 5,000 | off | 575 | 5000 | 39736 | 15.9 | 15.9 | 45.5 | 129 |
| Flowinger | 5,000 | on | 49 | 135 | 829 | 2.7 | 1.7 | 3.8 | 7 |
| React Flow | 5,000 | on | 302 | 96 | 788 | 3.5 | 3.8 | 4.0 | 12 |
| Flowinger | 10,000 | off | 617 | 10000 | 59819 | 8.5 | 10.7 | 71.3 | 169 |
| React Flow | 10,000 | off | 1242 | 10000 | 79620 | 32.6 | 33.0 | 91.7 | 254 |
| Flowinger | 10,000 | on | 55 | 135 | 829 | 3.6 | 2.5 | 4.0 | 8 |
| React Flow | 10,000 | on | 594 | 96 | 788 | 4.2 | 4.7 | 4.8 | 18 |

<!-- /bench:table -->

### Reading it

**Without culling, Flowinger is the cheaper of the two.** At 10,000 nodes it mounts in 0.6 s against 1.2 s;
a pan or a pinch costs 8.5 and 10.7 ms a frame against 33 — Flowinger is inside a 60 Hz frame, React Flow is
down to 30 frames a second; it holds 169 MB of JS heap against 254 and 60,000 elements against 80,000, because
a node and an edge are made of fewer parts. Dragging one node is about the same cost up to 5,000 nodes and a
fifth cheaper at 10,000 — and heavy in both: 71 and 92 ms a mouse move is a stutter. Drawing everything is what
an unculled canvas does, and it is the reason culling exists.

**With culling, a mount no longer grows with the graph.** Flowinger mounts 1,000, 5,000 and 10,000 nodes in 41,
49 and 55 ms; React Flow in 83, 302 and 594. Both draw only what is in view in the end, but React Flow's first
render draws every node and then drops them, and until this change Flowinger's did too: the nodes and options
reach its store in layout effects, after that render. Now the culling feature judges the first render from the
props — the starting view and an assumed 1920 × 1080 pane — so a 10,000-node mount draws about 135 nodes from
the start. (A server renders the same set, which keeps hydration exact.) The JS heap follows: 8 MB against 18.

**Panning, zooming and dragging with culling are inside a frame in both, and level or cheaper here.** At 10,000
nodes a pan costs 3.6 and 4.2 ms, a zoom 2.5 and 4.7, a drag 4.0 and 4.8; at 5,000, 2.7 and 3.5, 1.7 and 3.8,
3.8 and 4.0. While the view stays inside the region last worked out (the view and a quarter-view margin) a frame
asks nothing again, which is why the zoom costs about half. At 1,000 nodes the numbers are small enough that
the noise below decides them — a drag there read 3.4 against 3.1 — and across three runs on one day React Flow's
culled pan at 10,000 nodes read between 2.6 and 4.2 ms: call the pan level and the zoom and mount ahead.

**Noise.** The same configuration, run again, moved by a few tenths of a millisecond — and by up to a third on
the smallest numbers (a pan at 1,000 nodes read 2.7 and 4.4 ms in two runs of the same build), and
the largest ones moved by more when the machine was busy. Read the large differences; do not read a table
cell against its neighbour at 1,000 nodes.

### What the benchmark found in Flowinger

The first complete run was not flattering, and it is why this page exists. With culling on, a 10,000-node
graph mounted in 2.1 s (React Flow: 0.6), zoomed at 13.6 ms a frame (4.8) and dragged at 10.2 ms a move (4.8) —
a mount and a zoom worse than not culling at all. Everything wrong was of one kind — work proportional to the
whole graph done where it needed to be proportional to what is in view — and was found by profiling:

- Registering and removing a handle woke everything that watches the graph, including the culling pass and a
  `useStore` state read that forced a layout. Unmounting a thousand nodes did it two thousand times.
- "Is every node measured?" scanned every node, and was asked after every handle and every measurement: a
  quadratic mount. It is a counter.
- The edge layer rebuilt a map of every node, and walked every edge, each time the visible set changed;
  and the selection was recomputed from every node and edge even when nothing was selected.

Those got the mount and the zoom to React Flow's neighbourhood, and left a drag at 7.7 ms against 4.7. A
second round closed that: a drag hands the canvas a list that is the last one with one node replaced, and
`setNodes`, the canvas's and the stacking feature's nesting, the dimension reports and the culling pass each
rebuilt from the whole list. They now start from the answer they had and look at what was replaced.

The commits are `8b053d9` and `3958582` (the first round) and `895ffe7` and `cf0d627` (the second), each with
tests: a long run of random edits fed to one store and compared after every edit with a store given the end
state at once, and mutations of the fast paths that those tests fail. The price is size: the core is 0.7 kB
larger and the culling feature 0.7 kB larger — the budgets were raised to 20 and 36 kB for it, as their own
change.

## What is measured

| Column | What it is |
|---|---|
| **Mount** | From calling `render` to the last change to the document: every node, handle and edge there. Layout and paint of that last change are not in it. |
| **Nodes in DOM** / **DOM elements** | What the page holds once mounted: `.react-flow__node` elements, and every element. |
| **Pan**, **Zoom** | Main-thread time per frame, in milliseconds, over 150 frames — each frame one `wheel` event (a pan by two-finger scroll, a pinch zoom), then a wait for the next frame. The browser's own counter of time spent in tasks, so it is script, style, layout and paint preparation together. At 60 Hz a frame is 16.7 ms: above that, frames are dropped. |
| **Drag** | Main-thread time per mouse move, over 60 moves of one node, driven by real (CDP) mouse events. |
| **JS heap** | After a garbage collection, once mounted, before any interaction. |

"Culling" is `onlyRenderVisibleElements`: off draws everything, on draws only what is in (or near) view.
React Flow draws what intersects the viewport; Flowinger draws that and a quarter of the view beyond each
side, so a node is already there as it slides in — which is why it holds more nodes in the document at the same
setting.

## How it is run

```bash
pnpm bench                       # the whole matrix, 5 runs each: about twenty minutes
pnpm bench --n 1000 --runs 1     # a quick look
E2E_CHANNEL=chrome pnpm bench    # an installed Chrome, not Playwright's Chromium
```

- **One page, both libraries** ([`bench/main.tsx`](../bench/main.tsx)), built for production with Vite, so both
  are measured the way an application would ship them. A clean page — a new browser context — for every run.
- **The graph** is a grid, each node joined to the next in its row, with one custom node (a box, a label and
  two handles) in both libraries. Nodes are `nodesDraggable`, not connectable or selectable; `panOnScroll`
  is on, as it is in most editors; nothing else is set.
- **Driven from outside** by [`scripts/bench.mjs`](../scripts/bench.mjs) with Playwright, on a 1280 × 720
  viewport. The wheel events are dispatched in the page — one per frame, at whatever is under the middle of
  the canvas — so both libraries see the same sequence; the drag is real mouse input.
- **Medians** of five runs, per library, size and culling setting. A run in which the pan or zoom did not move
  the view, or the drag did not move the node, is reported as `n/a` rather than as a number.

## What this does not show

- **One machine, one browser, one day.** An Apple M4 in Chrome. A mid-range laptop or a phone will be several
  times slower, and not necessarily by the same factor in both libraries. The harness does not throttle the CPU;
  that is an obvious next step.
- **A synthetic graph.** A grid with one cheap node type. Real nodes have content, real edges have labels and
  custom paths, and what it costs to draw those is yours — more so than the engine's.
- **Not frame rate.** Main-thread time per frame says how much of the 16.7 ms a frame costs on this machine; it
  leaves out rasterising and compositing, which run elsewhere and dominate on a large canvas at high zoom.
- **Not everything.** Selection of many nodes, resizing, the minimap, edge reconnecting, touch, and memory
  growth over a long session are not measured.
- **Defaults of each library.** Each is measured with its own default CSS and the props listed above. A graph
  tuned for one — simpler edges, a smaller `nodeExtent`, fewer handles — would move both.
- **A working laptop.** Other applications were open, and nothing is pinned or isolated. The five runs and the
  median are there to take the edge off that, not to remove it.

The versions measured, and the machine, are stated with the table. Flowinger's number is from the commit
named there, which may be ahead of the latest release on npm.
