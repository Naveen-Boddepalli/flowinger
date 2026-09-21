/**
 * An element's layout size, in graph units — untouched by the viewport's scale,
 * as `offsetWidth` is, but fractional, as `offsetWidth` is not.
 *
 * `offsetWidth` rounds to whole pixels, which puts every edge up to half a unit
 * off a node's true centre, and skews the scale derived from it when a handle's
 * position is worked out. The computed width is the used value, fractions and
 * all. Where there is no computed size (jsdom, `display: none`) it falls back to
 * the offset.
 *
 * A node wrapper has no padding or border of its own, so its content box is its
 * border box; that is what makes the computed width the right number.
 */
export function layoutSize(el: HTMLElement): { width: number; height: number } {
  const style = getComputedStyle(el);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  return {
    width: Number.isFinite(width) ? width : el.offsetWidth,
    height: Number.isFinite(height) ? height : el.offsetHeight,
  };
}
