import { expect, type Locator, type Page } from '@playwright/test';

export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** The viewport element's `translate(Xpx, Ypx) scale(Z)`, as numbers. */
export async function view(page: Page): Promise<View> {
  const style = await page.locator('.react-flow__viewport').evaluate((el) => (el as HTMLElement).style.transform);
  const match = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(style);
  if (!match) throw new Error(`unexpected viewport transform: ${style}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

export async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function paneBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('.react-flow').boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

export const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
export const handle = (page: Page, nodeId: string, handleId: string) =>
  page.locator(`.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`);
export const edge = (page: Page, id: string) => page.locator(`[data-testid="rf__edge-${id}"]`);

/** Opens the demo and waits until it is framed (`fitView` has run). */
export async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`./${query}`);
  await expect(node(page, '1')).toBeVisible();
  await expect.poll(async () => (await view(page)).zoom).not.toBe(1);
}

/** Presses at one place, moves along the way in `steps`, and lets go — returns with the pointer up. */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** What is on top at a screen point: the id of the node there, or null. */
export async function nodeAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(
    ([px, py]) => document.elementFromPoint(px as number, py as number)?.closest('.react-flow__node')?.getAttribute('data-id') ?? null,
    [x, y],
  );
}

/**
 * A point inside `locator`'s box where a press reaches it — not a handle on it, and not something drawn over
 * it (the demo's header, a panel). A fixed offset into a node is only as good as where the framing put it.
 */
export async function pressablePoint(locator: Locator): Promise<{ x: number; y: number }> {
  const point = await locator.evaluate((target) => {
    const r = target.getBoundingClientRect();
    for (let fy = 0.5; fy < 1; fy += 0.1) {
      for (const sy of [fy, 1 - fy]) {
        for (let fx = 0.5; fx < 1; fx += 0.1) {
          for (const sx of [fx, 1 - fx]) {
            const x = r.left + r.width * sx;
            const y = r.top + r.height * sy;
            const hit = document.elementFromPoint(x, y);
            if (hit && target.contains(hit) && !hit.closest('.react-flow__handle')) return { x, y };
          }
        }
      }
    }
    return null;
  });
  if (!point) throw new Error('nothing of it can be pressed');
  return point;
}

/**
 * A point in the canvas with nothing on it — not a node, an edge, a handle or a panel (`Controls` and the
 * `MiniMap` sit in its corners) — searched from `from` (fractions of the canvas) outwards. A drag from here
 * pans the view.
 */
export async function emptyPoint(page: Page, from = { x: 0.85, y: 0.85 }): Promise<{ x: number; y: number }> {
  const point = await page.locator('.react-flow').evaluate((canvas, start) => {
    const r = canvas.getBoundingClientRect();
    const taken = '.react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__panel, .react-flow__minimap';
    for (let ring = 0; ring < 20; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const x = r.left + r.width * start.x + dx * 12;
          const y = r.top + r.height * start.y + dy * 12;
          if (x < r.left + 4 || x > r.right - 4 || y < r.top + 4 || y > r.bottom - 4) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && canvas.contains(hit) && !hit.closest(taken)) return { x, y };
        }
      }
    }
    return null;
  }, from);
  if (!point) throw new Error('no empty place on the canvas');
  return point;
}
