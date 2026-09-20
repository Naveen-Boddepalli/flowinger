// @vitest-environment node
// A real server has no `document`, and this package's layout effects depend on that (React 18
// warns about useLayoutEffect on the server) — so these run where there really is none. jsdom
// defines `document` at module load and would hide exactly what is being tested.
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { tree } from './ssrFixture.tsx';

describe('Flowinger server rendering', () => {
  it('has no document, as a server has none', () => {
    expect(typeof document).toBe('undefined');
  });

  it('renders to a string without a DOM, and without React warnings', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(tree);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();

    expect(html).toContain('alpha');
    expect(html).toContain('beta');
    expect(html).toContain('joins'); // the edge label
    expect(html).toContain('Zoom in'); // Controls
    expect(html).toContain('translate(10px, 20px)'); // a node, where the layout put it
  });

  it('writes the initial viewport into the markup, so the first paint is already framed', () => {
    const html = renderToString(tree);
    expect(html).toContain('translate(5px, 6px) scale(2)');
  });

  it('draws edges from declared sizes, before anything can be measured', () => {
    const html = renderToString(tree);
    // a's bottom-middle is (10 + 50, 20 + 40); b's top-middle is (60, 220).
    expect(html).toMatch(/M 60\.00 60\.00 C[^"]*60\.00 220\.00/);
    expect(html).toContain('marker-end="url(#');
  });

  it('reports "not mounted" on the server, where no canvas has attached', () => {
    expect(renderToString(tree)).toContain('unmounted 2');
  });
});
