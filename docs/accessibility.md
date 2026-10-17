# Accessibility

What a keyboard and a screen reader can do with a Flowinger canvas, how to turn it on, and what has not been
done yet. Everything here was checked by hand with VoiceOver in Safari on macOS, against the
[demo](https://naveen-boddepalli.github.io/flowinger/demo/), as well as by the browser suite.

## Turning it on

A canvas that only shows a graph has nothing to operate, so by default it adds nothing for assistive technology
to land on. Interaction brings the keyboard with it:

```tsx
<FlowingerCanvas
  nodes={nodes}
  edges={edges}
  elementsSelectable // nodes and edges become tab stops: Enter or Space selects, Escape lets go
  nodesDraggable // a selected node moves with the arrow keys (Shift for four times as far)
  keyboardNavigation // the canvas itself is a tab stop: the arrows pan, + and - zoom, 0 fits
  ariaLabel="Query plan" // what the canvas is called; "Diagram" if you leave it out
/>
```

`<ReactFlow>` has React Flow's defaults, so its nodes and edges are selectable, and reachable by keyboard,
without asking.

## What a screen reader hears

- **The canvas** is `role="application"` whenever something in it takes keys, as React Flow's always is, and is
  named by `ariaLabel`. A screen reader then hands it the arrow keys rather than reading on with them. A canvas
  with nothing to operate stays a plain region.
- **A node** that can be focused is a `group`, read by its content (or its own `ariaLabel`), with a hint
  saying how to select, move and delete it. A selected node is marked `aria-current`.
- **An edge** that can be focused is a `button` named "Edge from *a* to *b*" (or its own `ariaLabel`),
  `aria-pressed` while selected, with a hint.
- **A move made with the arrow keys** is announced: "Moved selected node right. New position, x: 285, y: 500".
- **The controls** are buttons named "Zoom in", "Zoom out", "Fit view" and "Toggle interactivity" (a toggle
  button). The minimap is an image named "Minimap".
- All of the text is React Flow's, and `ariaLabelConfig` replaces any of it, with the same keys as React Flow.

## Checked with VoiceOver

On 1.0.0, in Safari on macOS: tabbing onto the canvas, onto each node and edge and onto the controls; selecting
with Space; moving with the arrows; deleting with Backspace; the focus ring; and the view panning to a node that
takes focus out of sight. Three things did not work; they are fixed in 1.0.1, and passed when checked again:

- **Only the first keyboard move was announced.** The live region's text was changed in place, which Safari with
  VoiceOver announces only once; each announcement is now an element of its own. It also said where the node
  *was* — copied from React Flow — under "New position"; it now says where the node is.
- **Escape did not let go of a selected node** while the node had focus, only while the canvas did. It now
  unselects the focused node or edge, as React Flow's does.
- **With Quick Nav on, VoiceOver kept the arrow keys** for itself. The canvas was a `group`; it is now an
  `application`, as React Flow's is.

## Not done yet

- **NVDA and JAWS on Windows** have not been tried.
- **Connecting two nodes needs a pointer.** A handle cannot be reached or used from the keyboard. This is on the
  [roadmap](https://github.com/Naveen-Boddepalli/flowinger/blob/main/ROADMAP.md).
- **Deleting is not announced**, nor are selections, connections or changes made by the app.
- **Nodes and edges have no `aria-roledescription`**, which React Flow gives them ("node", "edge").

If something here does not work with the screen reader you use, please
[open an issue](https://github.com/Naveen-Boddepalli/flowinger/issues) saying which one, and on what.
