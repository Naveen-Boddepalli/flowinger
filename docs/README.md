# Flowinger documentation

These pages describe the current `main`. What is newer than the latest release on npm is listed under
*Unreleased* in the [changelog](../CHANGELOG.md).

## Start here

| | |
|---|---|
| [Getting started](getting-started.md) | Install, a first diagram, making it interactive, and the first things that trip people |
| [Examples](../examples) | Two complete Vite apps: a layout viewer and a controlled editor |

## Guides

| | |
|---|---|
| [An org chart](guides/org-chart.md) | A tree of people with collapsible branches, laid out by `d3-hierarchy` |
| [Lay out a DAG with dagre](guides/dag-layout.md) | Positions from dagre, ELK or d3-hierarchy, and which to pick |
| [A flowchart editor with undo and redo](guides/flowchart-editor.md) | Drag, connect, delete, shapes, copy and paste, snap guides — and undo |
| [Export to PNG, JPEG or SVG](guides/export-png.md) | The whole diagram as an image: resolution, background, a social card, the clipboard |
| [Save and load as JSON](guides/save-load-json.md) | `toObject()` to storage or a file and back, with a check for files you did not write |
| [A workflow builder in Next.js](guides/nextjs-workflow.md) | Laid out in a Server Component, hydrated into an editor, nothing jumps |

## Reference

| | |
|---|---|
| [API reference](api.md) | Canvas props, nodes and edges, handles, sub-flows, the instance, controlled flows |
| [Components and hooks](components.md) | `Handle`, `Background`, `Controls`, `MiniMap`, `NodeToolbar`, `NodeResizer`, `useReactFlow`… |
| [Features](features.md) | The small core and its opt-in features: what each adds, what needs it, writing your own |
| [The "pro" modules](pro.md) | Undo/redo, copy and paste, snap guides, export, smart edges, flowchart shapes, a collapsible tree — free, separate entry points |
| [Theming](theming.md) | The `--flowinger-*` CSS variables |
| [Server rendering](server-rendering.md) | What renders on the server and what waits for the client |

## Coming from React Flow

| | |
|---|---|
| [Migrating from React Flow](migrating-from-react-flow.md) | A checklist: the defaults that differ, types, what is missing and what to do instead |
| [React Flow coverage](react-flow-coverage.md) | How much of its API this covers, measured from its own type declarations |
| [Benchmarks](benchmarks.md) | Mount, pan, zoom and drag against React Flow at 1,000–10,000 nodes, culled and not — and how to re-run them |

## About the project

| | |
|---|---|
| [Roadmap](../ROADMAP.md) | Where it is going, and where help is most useful |
| [Changelog](../CHANGELOG.md) | What changed in each release |
| [Contributing](../CONTRIBUTING.md) | What fits, what "done" means here, how to run everything |
| [Design record](../plan.md) | What was built, what was measured, what was tried and dropped |
