// @vitest-environment node
// Where the view starts is in the first markup, so a server-rendered page is framed before anything runs.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FlowingerCanvas } from '../index.ts';

describe('a controlled viewport, server-rendered', () => {
  it('is written into the markup', () => {
    const html = renderToString(
      <FlowingerCanvas
        nodes={[{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: {} }]}
        defaultViewport={{ x: 500, y: 500, zoom: 1 }}
        viewport={{ x: 40, y: 30, zoom: 1.5 }}
        onViewportChange={() => {}}
      />,
    );
    expect(html).toContain('translate(40px, 30px) scale(1.5)');
    expect(html).not.toContain('translate(500px, 500px)');
  });
});
