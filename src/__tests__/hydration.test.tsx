import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { framedByCanvas, heldByCanvas, tree } from './ssrFixture.tsx';

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

  it.each([
    ['defaultViewport', framedByCanvas, 'translate(30px, 40px) scale(1.5)'],
    ['a controlled viewport', heldByCanvas, 'translate(-7px, 8px) scale(0.5)'],
  ])('hydrates a canvas framed by its own %s without a mismatch, and stays there', async (_, element, transform) => {
    const html = renderToString(element);
    expect(html).toContain(transform);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, element);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLElement>('.flowinger-viewport')?.style.transform).toBe(transform);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
