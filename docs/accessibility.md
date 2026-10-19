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
- **A handle** that can be connected is a `button` named "source handle out" or "target handle in" (or
  `handle.ariaLabel`), with a hint saying how to connect from it; `aria-pressed` while a connection begun from it
  waits for its other end. See [connecting from the keyboard](#connecting-from-the-keyboard).
- **A move made with the arrow keys** is announced: "Moved selected node right. New position, x: 285, y: 500".
- **The controls** are buttons named "Zoom in", "Zoom out", "Fit view" and "Toggle interactivity" (a toggle
  button). The minimap is an image named "Minimap".
- The text is React Flow's, with the same `ariaLabelConfig` keys to replace it, except what is said about
  connecting, which React Flow does not have: `handle.a11yDescription.default` and
  `connection.ariaLiveMessage.start`, `.connected`, `.invalid` and `.cancelled`.

## Connecting from the keyboard

With `nodesConnectable`, two nodes can be connected without a pointer:

1. Tab to a node, then on into its handles. A node's handles are tab stops only while focus is inside the node,
   so Tab still goes node by node, and from a node into its own handles.
2. Press Enter or Space on the handle to connect from. "Connecting from source handle out of Filter. Press enter
   on another handle, or escape to cancel."
3. Go to the other node, into its handle, and press Enter or Space. "Connected source handle out of Filter to
   target handle in of Output." The connection goes to `onConnect`, as a dragged or clicked one does; one that
   is not valid is said to be so, and nothing is connected.
4. Escape — on a handle, or anywhere in the canvas — lets go of a connection begun, and so does pressing the
   same handle again.

A node is named by its `ariaLabel`, else its `data.label`, else the text it shows. This works with
`connectOnClick` off, since a keyboard cannot drag; it does not call `onClickConnectStart` or
`onClickConnectEnd`, which are given mouse events. `disableKeyboardA11y` turns it off. It is checked in Chromium,
Firefox and WebKit by the browser suite, and was checked with VoiceOver in Safari on macOS for 1.2.0.

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

On 1.2.0: connecting two nodes from the keyboard, as [above](#connecting-from-the-keyboard) — the handles read
as buttons with their hint, and each step is announced.

## Not done yet

- **NVDA and JAWS on Windows** have not been tried.
- **Deleting is not announced**, nor are selections, connections made by dragging, or changes made by the app.
- **Nodes and edges have no `aria-roledescription`**, which React Flow gives them ("node", "edge").

If something here does not work with the screen reader you use, please
[open an issue](https://github.com/Naveen-Boddepalli/flowinger/issues) saying which one, and on what.
