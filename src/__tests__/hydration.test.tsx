import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { tree } from './ssrFixture.tsx';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Flowinger hydration', () => {
  it('hydrates the server markup without a mismatch or a warning', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(tree);
    quiet.mockRestore();
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree);
    });

    expect(errors).not.toHaveBeenCalled();
    // …and it is alive afterwards: mounted, with its handles measured or not,
    // and the framing intact.
    expect(container.textContent).toContain('mounted 2');
    // The HTML edge label is drawn once the layer it goes into has mounted.
    expect(container.querySelector('.flowinger-edge-labels')?.textContent).toContain('HTML-LABEL');
    expect(container.querySelector<HTMLElement>('.flowinger-viewport')?.style.transform).toBe(
      'translate(5px, 6px) scale(2)',
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
