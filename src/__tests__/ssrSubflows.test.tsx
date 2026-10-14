// @vitest-environment node
// A real server: no `document`, so the layout effects have not run and the store knows no nodes.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FlowingerCanvas, type Node } from '../index.ts';

const n = (id: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  width: 100,
  height: 40,
  data: {},
  ...extra,
});

describe('server rendering nested nodes and a culled diagram', () => {
  it('has no document, as a server has none', () => {
    expect(typeof document).toBe('undefined');
  });

  it('places a child in canvas coordinates from the first paint', () => {
    const html = renderToString(
      <FlowingerCanvas nodes={[n('p', 100, 50), n('c', 10, 20, { parentId: 'p' }), n('g', 1, 2, { parentId: 'c' })]} />,
    );
    expect(html).toContain('translate(100px, 50px)');
    expect(html).toContain('translate(110px, 70px)');
    expect(html).toContain('translate(111px, 72px)');
  });

  it('leaves out the children of a hidden parent', () => {
    const html = renderToString(
      <FlowingerCanvas nodes={[n('p', 0, 0, { hidden: true }), n('c', 1, 1, { parentId: 'p' }), n('x', 5, 5)]} />,
    );
    expect(html).not.toContain('data-id="c"');
    expect(html).toContain('data-id="x"');
  });

  it('draws what is near the starting view when only what is in view is asked for — and what is selected', () => {
    // Judged against a 1920 × 1080 pane (there is none to measure), so a 10,000-node page does not send them all.
    const html = renderToString(
      <FlowingerCanvas
        nodes={[n('near', 0, 0), n('far', 5000, 0), n('picked', 6000, 0, { selected: true })]}
        edges={[{ id: 'near-far', source: 'near', target: 'far' }]}
        onlyRenderVisibleElements
      />,
    );
    expect(html).toContain('data-id="near"');
    expect(html).not.toContain('data-id="far"');
    expect(html).toContain('data-id="picked"');
    // An edge with one end drawn is drawn.
    expect(html).toContain('data-testid="rf__edge-near-far"');
  });

  it('judges from where the view starts', () => {
    const html = renderToString(
      <FlowingerCanvas nodes={[n('near', 0, 0), n('far', 5000, 0)]} defaultViewport={{ x: -5000, y: 0, zoom: 1 }} onlyRenderVisibleElements />,
    );
    expect(html).not.toContain('data-id="near"');
    expect(html).toContain('data-id="far"');
  });

  it('draws a selected, reconnectable edge without its drag handles, which need the browser', () => {
    const html = renderToString(
      <FlowingerCanvas
        nodes={[n('a', 0, 0), n('b', 0, 200)]}
        edges={[{ id: 'e', source: 'a', target: 'b', selected: true }]}
        elementsSelectable
        onEdgesChange={() => {}}
        onReconnect={() => {}}
      />,
    );
    expect(html).toContain('data-testid="rf__edge-e"');
    expect(html).not.toContain('flowinger-reconnect-anchor');
  });
});
