// What a real browser knows and jsdom does not: measured sizes, where a handle is really drawn, pointer
// capture, the wheel. Each test is a behaviour that has gone wrong, or could only be seen, in a browser —
// see plan.md. They drive the demo (index.html + demo/), which has every feature on.
import { expect, test, type Locator, type Page } from '@playwright/test';

interface View {
  x: number;
  y: number;
  zoom: number;
}

/** The viewport element's `translate(Xpx, Ypx) scale(Z)`, as numbers. */
async function view(page: Page): Promise<View> {
  const style = await page.locator('.react-flow__viewport').evaluate((el) => (el as HTMLElement).style.transform);
  const match = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(style);
  if (!match) throw new Error(`unexpected viewport transform: ${style}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const handle = (page: Page, nodeId: string, handleId: string) =>
  page.locator(`.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`);
const edge = (page: Page, id: string) => page.locator(`[data-testid="edge-${id}"]`);

/**
 * A point of empty canvas: inside the pane, clear of every node and of the demo's own widgets — the
 * minimap sits at the bottom left (and is itself pannable, in the opposite sense), the controls at the
 * bottom right, the options panel at the top right.
 */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const pane = await page.locator('.react-flow').boundingBox();
  if (!pane) throw new Error('no canvas');
  return { x: pane.x + 30, y: pane.y + 30 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(node(page, '1')).toBeVisible();
  // `fitView` frames once the nodes are measured; until then the viewport is the identity.
  await expect.poll(async () => (await view(page)).zoom).not.toBe(1);
});

test('loads framed, with every node and edge and nothing in the console', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.reload();
  await expect(node(page, '4')).toBeVisible();

  await expect(page.locator('.react-flow__node')).toHaveCount(5); // four operators and the group
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  const pane = await page.locator('.react-flow').boundingBox();
  for (const id of ['1', '2', '3', '4']) {
    const box = await node(page, id).boundingBox();
    expect(box, `node ${id} is visible`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(pane!.x - 1);
    expect(box!.y).toBeGreaterThanOrEqual(pane!.y - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(pane!.x + pane!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(pane!.y + pane!.height + 1);
  }
  expect(problems).toEqual([]);
});

test('an edge starts and ends at the outer edge of the handles it names, as drawn', async ({ page }) => {
  // The anchor comes from *measuring* where each handle is laid out, not from a declared size: this is
  // the geometry the trial swap into QueryLens found to be off by the handle's radius.
  const d = await edge(page, 'e1-2').locator('.react-flow__edge-path').getAttribute('d');
  const numbers = (d ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  expect(numbers.length).toBeGreaterThanOrEqual(8);
  const [sx, sy] = [numbers[0]!, numbers[1]!];
  const [tx, ty] = [numbers[numbers.length - 2]!, numbers[numbers.length - 1]!];

  const v = await view(page);
  const pane = (await page.locator('.react-flow').boundingBox())!;
  const toGraph = (px: number, py: number) => ({ x: (px - pane.x - v.x) / v.zoom, y: (py - pane.y - v.y) / v.zoom });

  const out = (await handle(page, '1', 'out').boundingBox())!; // a bottom handle: its outer edge is its bottom
  const into = (await handle(page, '2', 'in').boundingBox())!; // a top handle: its outer edge is its top
  const start = toGraph(out.x + out.width / 2, out.y + out.height);
  const end = toGraph(into.x + into.width / 2, into.y);

  expect(Math.abs(sx - start.x)).toBeLessThan(0.75);
  expect(Math.abs(sy - start.y)).toBeLessThan(0.75);
  expect(Math.abs(tx - end.x)).toBeLessThan(0.75);
  expect(Math.abs(ty - end.y)).toBeLessThan(0.75);
});

test('the wheel zooms about the pointer: the point under it stays put', async ({ page }) => {
  const at = await centre(node(page, '3'));
  const pane = (await page.locator('.react-flow').boundingBox())!;
  const before = await view(page);
  const graph = { x: (at.x - pane.x - before.x) / before.zoom, y: (at.y - pane.y - before.y) / before.zoom };

  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(before.zoom);

  const after = await view(page);
  const screen = { x: pane.x + after.x + graph.x * after.zoom, y: pane.y + after.y + graph.y * after.zoom };
  expect(Math.abs(screen.x - at.x)).toBeLessThan(1);
  expect(Math.abs(screen.y - at.y)).toBeLessThan(1);
});

test('dragging the empty canvas pans it, and only pans it', async ({ page }) => {
  const from = await emptySpot(page);
  const before = await view(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y - 50, { steps: 8 });
  await page.mouse.up();

  const after = await view(page);
  expect(after.zoom).toBe(before.zoom);
  expect(after.x - before.x).toBeCloseTo(90, 0);
  expect(after.y - before.y).toBeCloseTo(-50, 0);
});

test('dragging a node moves it and its edges, and does not pan the view', async ({ page }) => {
  const target = node(page, '3');
  const start = await centre(target);
  const viewBefore = await view(page);
  const pathBefore = await edge(page, 'e1-3').locator('.react-flow__edge-path').getAttribute('d');

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 70, start.y + 40, { steps: 8 });
  await page.mouse.up();

  const end = await centre(target);
  expect(end.x - start.x).toBeCloseTo(70, 0);
  expect(end.y - start.y).toBeCloseTo(40, 0);
  expect(await view(page)).toEqual(viewBefore);
  expect(await edge(page, 'e1-3').locator('.react-flow__edge-path').getAttribute('d')).not.toBe(pathBefore);
});

test('a quick drag — one big jump, the first move landing off the node — does not lose the node', async ({ page }) => {
  // Pointer capture waits for the drag threshold, so the first move can land on the pane or on a node
  // beneath; the node must still follow. (A bug jsdom could not show: plan.md, second round.)
  const target = node(page, '4');
  const start = await centre(target);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 260, start.y - 180); // a single step
  await page.mouse.up();

  const end = await centre(target);
  expect(end.x - start.x).toBeCloseTo(-260, 0);
  expect(end.y - start.y).toBeCloseTo(-180, 0);
});

test('dragging from one handle to another makes a connection', async ({ page }) => {
  const before = await page.locator('.react-flow__edge').count();
  const from = await centre(handle(page, '2', 'out'));
  const to = await centre(handle(page, '4', 'in'));

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
});

test('Backspace deletes the selected node and the edges that touched it', async ({ page }) => {
  await node(page, '4').click();
  await expect(node(page, '4')).toHaveClass(/(^|\s)selected(\s|$)/);
  await page.keyboard.press('Backspace');

  await expect(node(page, '4')).toHaveCount(0);
  await expect(edge(page, 'e3-4')).toHaveCount(0);
  await expect(node(page, '3')).toBeVisible();
});
