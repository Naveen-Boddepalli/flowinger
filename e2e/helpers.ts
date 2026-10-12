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
