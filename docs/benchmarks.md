# Benchmarks

Flowinger and React Flow (`@xyflow/react`) drawing the same graph, in the same page, in a real browser — what
it costs to put 1,000, 5,000 and 10,000 nodes on the screen, to pan and zoom over them, and to drag one.

**In short** (Flowinger 2.0 with the drag fix on `main`, against React Flow 13.0.2). Without culling Flowinger mounts
1.4–1.8× as fast, pans and zooms level at 1,000 and 5,000 nodes and for 1.2–1.5× less at 10,000, holds about 30% less
memory, and drags a node for a little less: 1.1–1.3×. With `onlyRenderVisibleElements` on, Flowinger mounts 2–10×
as fast and zooms for 1.7–2.2× less; a pan and a drag are level, all well inside a 60 Hz frame at 10,000 nodes.

The numbers are from one machine and are meant to be **compared with each other, not quoted on their own**:
read [what this does not show](#what-this-does-not-show) before you do. Everything here is reproducible —
`pnpm bench` re-runs it, and [`bench/results.json`](../bench/results.json) holds what the table below was made
from.

## Results

<!-- bench:table -->

Measured 2026-11-22 on Apple M4 (10 cores, 17 GB), darwin 27.0.0, Chrome 156.0.8078.4, Node v24.16.0. Flowinger 2.0.0 @ 868f413; React Flow (`@xyflow/react`) 13.0.2. Median of 5 runs each.

| Library | Nodes | Culling | Mount (ms) | Nodes in DOM | DOM elements | Pan (ms/frame) | Zoom (ms/frame) | Drag (ms/move) | JS heap (MB) |
|---|---|---|---|---|---|---|---|---|---|
| Flowinger | 1,000 | off | 80 | 1000 | 5957 | 2.7 | 1.8 | 3.8 | 20 |
| React Flow | 1,000 | off | 115 | 1000 | 7892 | 3.3 | 2.5 | 5.0 | 28 |
| Flowinger | 1,000 | on | 39 | 135 | 831 | 3.3 | 1.9 | 3.8 | 6 |
| React Flow | 1,000 | on | 75 | 96 | 788 | 3.6 | 3.3 | 3.4 | 7 |
| Flowinger | 5,000 | off | 312 | 5000 | 29879 | 6.0 | 7.1 | 16.0 | 89 |
| React Flow | 5,000 | off | 500 | 5000 | 39736 | 6.0 | 6.5 | 17.8 | 128 |
| Flowinger | 5,000 | on | 46 | 135 | 831 | 2.8 | 1.8 | 3.9 | 7 |
| React Flow | 5,000 | on | 271 | 96 | 788 | 3.3 | 3.3 | 3.3 | 12 |
| Flowinger | 10,000 | off | 605 | 10000 | 59821 | 8.1 | 9.4 | 43.7 | 175 |
| React Flow | 10,000 | off | 1086 | 10000 | 79620 | 12.1 | 11.6 | 46.9 | 252 |
| Flowinger | 10,000 | on | 55 | 135 | 831 | 2.6 | 1.5 | 3.7 | 9 |
| React Flow | 10,000 | on | 571 | 96 | 788 | 2.1 | 3.3 | 4.4 | 17 |

<!-- /bench:table -->

### Reading it

**Without culling, Flowinger mounts, pans, zooms and drags for less, and holds less.** At 10,000 nodes Flowinger
mounts in 0.6 s against 1.1 s; a pan or a pinch costs 8.1 and 9.4 ms a frame against 12.1 and 11.6, both inside a
60 Hz frame; it holds 175 MB of JS heap against 252 and 60,000 elements against 80,000, because a node and an edge
are made of fewer parts. At 1,000 and 5,000 nodes the pan and the zoom are level. Dragging one node costs 44 ms a
mouse move against 47 at 10,000 nodes, 16 against 18 at 5,000, 3.8 against 5.0 at 1,000 — heavy in both at the large
sizes, which stutter. Drawing everything is what an unculled canvas does, and it is the reason culling exists.

**The drag was React Flow 13's until this table.** The one before it (2026-11-21, 2.0.0-rc.4) read 68 ms a move
against 49 at 10,000 nodes and 37 against 19 at 5,000: Flowinger's edge layer drew every edge again on each move of
a drag, to move the few that touch the dragged node, and reading the canvas's state forced a layout each time. It
keeps each edge as drawn now while its nodes have not moved. Alternating the code from before the change and after
it on the same machine, at 5,000 nodes, read 50 and 36 ms a move before and 27 and 15 after, and React Flow 33 and
17 beside them — the machine's noise, which is why the comparison was alternated.

**React Flow 13.0.0 is where its pre-release was.** Against the October table (2026-10-17, React Flow
13.0.0-next.0, Flowinger 2.0.0-rc.1), every React Flow number reads lower — its unculled mount at 10,000 nodes
1.45 s then, 1.1 s now — and so do Flowinger's, by about as much: 0.8 s then, 0.6 now. Run again on 2026-11-21 at
10,000 nodes, rc.1 against next.0 read what rc.4 against 13.0.2 read, to within the noise below (mount 596 and
1,088 ms, drag 68 and 47, culled pan 2.6 and 3.9). So the change is this machine's, not either
library's, and React Flow 12 → 13 is still the big step: against 12.11.6 (2026-10-14), its pan and zoom at 10,000
nodes went from 33 ms a frame to 14–15, and its drag from 92 to 57.

**With culling, a mount does not grow with the graph.** Flowinger mounts 1,000, 5,000 and 10,000 nodes in 39, 46 and
55 ms; React Flow 13 in 75, 271 and 571. Both draw only what is in view in the end, but React Flow's first render
draws every node and then drops them; Flowinger's culling feature judges the first render from the props — the
starting view and an assumed 1920 × 1080 pane — so a 10,000-node mount draws about 135 nodes from the start. (A
server renders the same set, which keeps hydration exact.) The JS heap follows: 9 MB against 17.

**Panning, zooming and dragging with culling are inside a frame in both.** A zoom is cheaper here at every size (1.5
against 3.3 ms at 10,000 nodes). A pan and a drag are a few milliseconds in both, and which one reads lower changes
from run to run: React Flow's culled pan at 5,000 nodes read 2.0, 3.5, 4.1 and 1.8 ms in four runs of the same code
the same afternoon, and this table has it at 2.1 against 2.6 at 10,000, where the one before had 3.8 against 3.0.
While the view stays inside the region last worked out (the view and a quarter-view margin) a frame asks nothing
again.

**Noise.** The same configuration, run again, moved by a few tenths of a millisecond on the small numbers — and by up
to a third on the largest: a full run of this matrix earlier the same day, with the machine less quiet, read
Flowinger's unculled mount at 10,000 nodes as 1.06 s and its drag as 116 ms. Read the large differences; do not
read a table cell against its neighbour at 1,000 nodes.

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
