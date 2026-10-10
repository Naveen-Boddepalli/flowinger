import type { DOMAttributes, HTMLAttributes, SVGAttributes } from 'react';

// What a component lets a caller add to its own element: `id`, `title`, `role`, `aria-*`, `tabIndex`, and
// `data-*` (which JSX accepts on any element without being declared). Left out, so they cannot be
// overridden or silently collide:
//   - every event handler (`DOMAttributes`) — the canvas owns the pointer and keyboard handling, and a
//     handler of yours would replace it;
//   - `className`, `style` and `children`, which each component already has props for;
//   - whatever the component sets itself, named by `Owned`.
// React Flow lets most of these through, handlers included; this is the subset that cannot break the
// engine. Types only.

/**
 * The attributes a caller may add to a component's element — a `<div>` unless `El` says otherwise (React's
 * `HTMLAttributes` is what carries `title`, which `SVGAttributes` has not).
 */
export type PassThroughHtml<Owned extends PropertyKey = never, El extends Element = HTMLDivElement> = Omit<
  HTMLAttributes<El>,
  keyof DOMAttributes<El> | 'className' | 'style' | 'children' | Owned
>;

/** The attributes a caller may add to a component's SVG element. */
export type PassThroughSvg<El extends SVGElement, Owned extends PropertyKey = never> = Omit<
  SVGAttributes<El>,
  keyof DOMAttributes<El> | 'className' | 'style' | 'children' | Owned
>;
