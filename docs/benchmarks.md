# Benchmarks

Flowinger and React Flow (`@xyflow/react`) drawing the same graph, in the same page, in a real browser — what
it costs to put 1,000, 5,000 and 10,000 nodes on the screen, to pan and zoom over them, and to drag one.

**In short** (Flowinger 2.0 against React Flow 13.0.2). Without culling Flowinger mounts 1.4–1.8× as fast, pans
and zooms level at 1,000 and 5,000 nodes and for 1.3–1.6× less at 10,000, and holds about 30% less memory; **React
Flow 13 drags a node 1.3–2× faster**. With `onlyRenderVisibleElements` on, Flowinger mounts 2–10× as fast, pans for
1.2–1.3× less and zooms for 2–2.6× less, and drags for 1.2–1.4× less, all well inside a 60 Hz frame at 10,000
nodes.

The numbers are from one machine and are meant to be **compared with each other, not quoted on their own**:
read [what this does not show](#what-this-does-not-show) before you do. Everything here is reproducible —
`pnpm bench` re-runs it, and [`bench/results.json`](../bench/results.json) holds what the table below was made
from.

## Results

<!-- bench:table -->

Measured 2026-11-21 on Apple M4 (10 cores, 17 GB), darwin 27.0.0, Chrome 156.0.8078.4, Node v24.16.0. Flowinger 2.0.0-rc.4 @ ebea916; React Flow (`@xyflow/react`) 13.0.2. Median of 5 runs each.

| Library | Nodes | Culling | Mount (ms) | Nodes in DOM | DOM elements | Pan (ms/frame) | Zoom (ms/frame) | Drag (ms/move) | JS heap (MB) |
|---|---|---|---|---|---|---|---|---|---|
| Flowinger | 1,000 | off | 78 | 1000 | 5957 | 2.9 | 2.0 | 6.3 | 20 |
| React Flow | 1,000 | off | 112 | 1000 | 7892 | 2.9 | 2.5 | 4.9 | 28 |
| Flowinger | 1,000 | on | 39 | 135 | 831 | 2.6 | 1.5 | 3.1 | 6 |
| React Flow | 1,000 | on | 75 | 96 | 788 | 3.2 | 3.0 | 3.6 | 7 |
| Flowinger | 5,000 | off | 311 | 5000 | 29879 | 6.2 | 7.3 | 36.9 | 88 |
| React Flow | 5,000 | off | 513 | 5000 | 39736 | 6.6 | 7.2 | 18.6 | 128 |
| Flowinger | 5,000 | on | 46 | 135 | 831 | 3.0 | 1.8 | 3.2 | 7 |
| React Flow | 5,000 | on | 280 | 96 | 788 | 3.7 | 3.6 | 4.5 | 12 |
| Flowinger | 10,000 | off | 604 | 10000 | 59821 | 8.0 | 9.7 | 67.9 | 173 |
| React Flow | 10,000 | off | 1094 | 10000 | 79620 | 12.6 | 12.5 | 49.1 | 252 |
| Flowinger | 10,000 | on | 54 | 135 | 831 | 3.0 | 1.7 | 4.0 | 8 |
| React Flow | 10,000 | on | 531 | 96 | 788 | 3.8 | 4.5 | 5.4 | 17 |

<!-- /bench:table -->

### Reading it

**Without culling, Flowinger mounts for less and holds less, and React Flow 13 drags for less.** At 10,000 nodes
Flowinger mounts in 0.6 s against 1.1 s; a pan or a pinch costs 8.0 and 9.7 ms a frame against 12.6 and 12.5, both
inside a 60 Hz frame; it holds 173 MB of JS heap against 252 and 60,000 elements against 80,000, because a node and
an edge are made of fewer parts. At 1,000 and 5,000 nodes the pan and the zoom are level. Dragging one node is where
React Flow 13 leads: 49 ms a mouse move against 68 at 10,000 nodes, 19 against 37 at 5,000, 4.9 against 6.3 at
1,000 — and heavy in both at the large sizes, which stutter. Drawing everything is what an unculled canvas does, and
it is the reason culling exists.

**React Flow 13.0.0 is where its pre-release was.** Against the table this one replaced (2026-10-17, React Flow
13.0.0-next.0, Flowinger 2.0.0-rc.1), every React Flow number reads lower here — its unculled mount at 10,000 nodes
1.45 s then, 1.1 s now — and so do Flowinger's, by about as much: 0.8 s then, 0.6 now. Run again the same day as
this table at 10,000 nodes, rc.1 against next.0 read what `main` against 13.0.2 reads, to within the noise below
(mount 596 and 1,088 ms, drag 68 and 47, culled pan 2.6 and 3.9). So the change is this machine's, not either
library's, and React Flow 12 → 13 is still the big step: against 12.11.6 (2026-10-14), its pan and zoom at 10,000
nodes went from 33 ms a frame to 14–15, and its drag from 92 to 57. The drag lead is React Flow 13's own, and the
next thing for Flowinger to close.

**With culling, a mount does not grow with the graph.** Flowinger mounts 1,000, 5,000 and 10,000 nodes in 39, 46 and
54 ms; React Flow 13 in 75, 280 and 531. Both draw only what is in view in the end, but React Flow's first render
draws every node and then drops them; Flowinger's culling feature judges the first render from the props — the
starting view and an assumed 1920 × 1080 pane — so a 10,000-node mount draws about 135 nodes from the start. (A
server renders the same set, which keeps hydration exact.) The JS heap follows: 8 MB against 17.

**Panning, zooming and dragging with culling are inside a frame in both, and cheaper here.** At 10,000 nodes a pan
costs 3.0 and 3.8 ms, a zoom 1.7 and 4.5, a drag 4.0 and 5.4; at 5,000, 3.0 and 3.7, 1.8 and 3.6, 3.2 and 4.5. While
the view stays inside the region last worked out (the view and a quarter-view margin) a frame asks nothing again.
At 1,000 nodes the numbers are small enough that the noise below decides them. A culled pan reads higher on this
machine than it did in October, in rc.1 as much as now (1.8 ms then, 2.6–3.0 now).

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
