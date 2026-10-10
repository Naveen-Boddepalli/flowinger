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

  it('draws everything when only what is in view is asked for, since nothing has a size yet', () => {
    const html = renderToString(
      <FlowingerCanvas nodes={[n('near', 0, 0), n('far', 5000, 0)]} onlyRenderVisibleElements />,
    );
    expect(html).toContain('data-id="near"');
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
