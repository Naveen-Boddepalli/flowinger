// What the unit tests can only model: connecting by clicking, the rectangle round a box selection, a box held
// at the pane's edge, stacking by what is actually on top, the colour scheme following the OS, the lock, a
// smooth move's path, reconnecting, and `nodrag` / `nopan` / `nowheel` from a real press. Each of these was
// implemented against jsdom and React Flow's source; here they are watched in a browser.
import { expect, test } from '@playwright/test';
import { centre, drag, edge, handle, node, nodeAt, open, paneBox, view } from './helpers.ts';

test.describe('connecting by clicking', () => {
  test('two clicks on handles make a connection, and the first is marked', async ({ page }) => {
    await open(page);
    const from = handle(page, '1', 'next');
    const to = handle(page, '4', 'prev');
    await from.click();
    await expect(from).toHaveClass(/clickconnecting/);
    await to.click();
    await expect(edge(page, '1:next->4:prev')).toHaveCount(1);
    await expect(from).not.toHaveClass(/clickconnecting/);
  });

  test('a click is not a drag: it does not leave a line behind, and a drag still connects', async ({ page }) => {
    await open(page);
    await handle(page, '1', 'next').click();
    await expect(page.locator('.react-flow__connection-path')).toHaveCount(0);
    // Finish it off, then make one by dragging.
    await handle(page, '4', 'prev').click();
    const a = await centre(handle(page, '3', 'next'));
    const b = await centre(handle(page, '4', 'in'));
    await drag(page, a, b);
    await expect(edge(page, '3:next->4:in')).toHaveCount(1);
  });
});

test.describe('the rectangle round a box selection', () => {
  async function boxEverything(page: import('@playwright/test').Page) {
    const pane = await paneBox(page);
    await page.keyboard.down('Shift');
    await drag(page, { x: pane.x + 8, y: pane.y + 8 }, { x: pane.x + pane.width - 8, y: pane.y + pane.height - 8 }, 10);
    await page.keyboard.up('Shift');
  }
  const rect = (page: import('@playwright/test').Page) => page.locator('.react-flow__nodesselection-rect');

  test('is drawn, and dragging it moves everything the box took', async ({ page }) => {
    await open(page);
    await boxEverything(page);
    await expect(rect(page)).toBeVisible();
    const before = await centre(node(page, '4'));
    const r = await centre(rect(page));
    await drag(page, r, { x: r.x + 60, y: r.y + 30 }, 6);
    const after = await centre(node(page, '4'));
    expect(Math.abs(after.x - before.x - 60)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y - 30)).toBeLessThan(2);
    // The rectangle went with them.
    const r2 = await centre(rect(page));
    expect(Math.abs(r2.x - r.x - 60)).toBeLessThan(2);
  });

  test('goes with a click on the empty canvas', async ({ page }) => {
    await open(page);
    await boxEverything(page);
    await expect(rect(page)).toBeVisible();
    const pane = await paneBox(page);
    await page.mouse.click(pane.x + 30, pane.y + 30); // the click that ends the box is the canvas's own
    await page.mouse.click(pane.x + 30, pane.y + 30);
    await expect(rect(page)).toHaveCount(0);
  });

  test('a box held at the pane\'s edge pans the view, and keeps growing', async ({ page }) => {
    await open(page);
    const pane = await paneBox(page);
    const before = await view(page);
    await page.keyboard.down('Shift');
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    await page.mouse.down();
    await page.mouse.move(pane.x + 4, pane.y + pane.height / 2, { steps: 6 });
    await page.waitForTimeout(600);
    const during = await view(page);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    // Held at the left edge, the view moves right (it looks further left).
    expect(during.x - before.x).toBeGreaterThan(100);
  });
});

test.describe('stacking', () => {
  test('a selected node is on top of what it overlaps, by what the browser says is there', async ({ page }) => {
    await open(page);
    // Put Output (4) over Projection (3).
    const three = await centre(node(page, '3'));
    const four = await centre(node(page, '4'));
    await drag(page, four, { x: three.x + 30, y: three.y + 20 }, 10);
    const a = await node(page, '3').boundingBox();
    const b = await node(page, '4').boundingBox();
    if (!a || !b) throw new Error('not visible');
    // The middle of where they overlap.
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    expect(right).toBeGreaterThan(left);
    expect(bottom).toBeGreaterThan(top);
    const overlap = { x: (left + right) / 2, y: (top + bottom) / 2 };

    // Select 3 by a click where 4 does not reach, then 4 the same way: whichever is selected is on top.
    await page.mouse.click(a.x + 6, a.y + 6);
    await expect(node(page, '3')).toHaveClass(/selected/);
    expect(await nodeAt(page, overlap.x, overlap.y)).toBe('3');
    await page.mouse.click(b.x + b.width - 6, b.y + b.height - 6);
    await expect(node(page, '4')).toHaveClass(/selected/);
    expect(await nodeAt(page, overlap.x, overlap.y)).toBe('4');
  });

  test('zIndexMode manual: nothing is raised, and nesting is not stacking', async ({ page }) => {
    await open(page, '?zIndexMode=manual');
    const z = (id: string) => node(page, id).evaluate((el) => getComputedStyle(el).zIndex);
    expect(await z('2')).toBe('0');
    expect(await z('3')).toBe('0');
    await node(page, '4').click({ position: { x: 20, y: 6 } });
    await expect(node(page, '4')).toHaveClass(/selected/);
    expect(await z('4')).toBe('0');
  });

  test('zIndexMode basic (the default): nesting stacks and selection raises', async ({ page }) => {
    await open(page);
    const z = (id: string) => node(page, id).evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(await z('3')).toBeGreaterThan(await z('4'));
    await node(page, '4').click({ position: { x: 20, y: 6 } });
    expect(await z('4')).toBeGreaterThanOrEqual(1000);
  });
});

test.describe('colorMode', () => {
  test('system follows the OS, live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, '?colorMode=system');
    const wrapper = page.locator('.react-flow');
    await expect(wrapper).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(wrapper).toHaveClass(/\blight\b/);
    await expect(wrapper).not.toHaveClass(/\bdark\b/);
    const surface = await wrapper.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--flowinger-surface'));
    expect(surface).not.toBe('');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(wrapper).toHaveClass(/\bdark\b/);
    expect(await wrapper.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--flowinger-surface'))).toBe('');
  });

  test('light is a class and a palette', async ({ page }) => {
    await open(page, '?colorMode=light');
    await expect(page.locator('.react-flow')).toHaveClass(/\blight\b/);
    // What reads the variable gets the light value: the resolved colour of the canvas's own custom property.
    const text = await page
      .locator('.react-flow')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--flowinger-text').trim());
    expect(text.toLowerCase()).toBe('#0f172a');
  });
});

test.describe('the lock', () => {
  test('switches dragging, and selecting, off and on again', async ({ page }) => {
    await open(page);
    const lock = page.getByRole('button', { name: 'Toggle interactivity' });
    await expect(lock).toBeVisible();
    // Where the node *is* — its place in the graph — not where it is on screen, which a pan also changes.
    const placed = () => node(page, '4').evaluate((el) => (el as HTMLElement).style.transform);
    const dragFour = async () => {
      const c = await centre(node(page, '4'));
      await drag(page, c, { x: c.x + 50, y: c.y + 20 }, 5);
    };
    const start = await placed();
    await dragFour();
    const moved = await placed();
    expect(moved).not.toBe(start);

    await lock.click();
    await dragFour();
    expect(await placed()).toBe(moved);
    // Nor can anything be selected: a click on an unselected node leaves it so.
    await node(page, '1').click({ position: { x: 20, y: 6 } });
    await expect(node(page, '1')).not.toHaveClass(/\bselected\b/);

    await lock.click();
    await dragFour();
    expect(await placed()).not.toBe(moved);
    await node(page, '1').click({ position: { x: 20, y: 6 } });
    await expect(node(page, '1')).toHaveClass(/\bselected\b/);
  });
});

test.describe("interpolate: 'smooth'", () => {
  async function fitFromFarAway(page: import('@playwright/test').Page): Promise<number[]> {
    const pane = await paneBox(page);
    const mid = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
    await page.mouse.move(mid.x, mid.y);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(1.8);
    // Pan a long way with the keyboard — 200 px a press, whatever is under the pointer: the diagram is
    // a few screens away.
    await page.locator('.react-flow').focus();
    for (let i = 0; i < 14; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await view(page)).x).toBeLessThan(-2000);
    const samples = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const el = document.querySelector('.react-flow__viewport') as HTMLElement;
          const out: number[] = [];
          const t0 = performance.now();
          const tick = () => {
            const m = /scale\(([\d.e-]+)\)/.exec(el.style.transform);
            if (m) out.push(Number(m[1]));
            if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.getByRole('button', { name: 'Fit view' }).click();
    return samples;
  }

  test('zooms out part-way along a long move and back in', async ({ page }) => {
    await open(page, '?smooth=1');
    const zooms = await fitFromFarAway(page);
    const end = zooms[zooms.length - 1] as number;
    const start = zooms[0] as number;
    // It dips below both ends: over a move this long the path zooms out and back in.
    expect(Math.min(...zooms)).toBeLessThan(Math.min(start, end) - 0.02);
  });

  test('left alone, a move keeps its zoom between where it began and where it ends', async ({ page }) => {
    await open(page);
    const zooms = await fitFromFarAway(page);
    const end = zooms[zooms.length - 1] as number;
    const start = zooms[0] as number;
    expect(Math.min(...zooms)).toBeGreaterThanOrEqual(Math.min(start, end) - 0.01);
  });
});

test.describe('reconnecting', () => {
  test('dragging the end of a selected edge to another handle moves it', async ({ page }) => {
    await open(page);
    // Select e3-4 by clicking the middle of its path.
    const at = await edge(page, 'e3-4').evaluate((g) => {
      const path = g.querySelector('path.react-flow__edge-path, path') as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      const m = path.getScreenCTM() as DOMMatrix;
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
    });
    await page.mouse.click(at.x, at.y);
    const anchor = page.locator('.flowinger-reconnect-anchor[data-end="target"]');
    await expect(anchor).toBeVisible();
    const from = await centre(anchor);
    const to = await centre(handle(page, '2', 'in'));
    await drag(page, from, to, 10);
    await expect(edge(page, 'flowinger-edge__3out-2in')).toHaveCount(1);
    await expect(edge(page, 'e3-4')).toHaveCount(0);
  });
});

test.describe('opt-outs, from a real press', () => {
  test('nodrag and nopan: a press that starts on such an element neither pans nor drags', async ({ page }) => {
    await open(page);
    const label = page.getByRole('button', { name: /cost 12/ });
    const before = await view(page);
    const nodeBefore = await centre(node(page, '1'));
    const c = await centre(label);
    await drag(page, c, { x: c.x + 15, y: c.y + 120 }, 10);
    const after = await view(page);
    expect(after).toEqual(before);
    const nodeAfter = await centre(node(page, '1'));
    expect(nodeAfter).toEqual(nodeBefore);
  });

  test('nowheel: the wheel over it is the page\'s, and everywhere else it zooms', async ({ page }) => {
    await open(page);
    await node(page, '4').click({ position: { x: 20, y: 6 } });
    const duplicate = page.getByRole('button', { name: 'Duplicate' });
    await expect(duplicate).toBeVisible();
    const before = (await view(page)).zoom;
    const c = await centre(duplicate);
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(150);
    expect((await view(page)).zoom).toBe(before);

    const pane = await paneBox(page);
    await page.mouse.move(pane.x + 30, pane.y + 30);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(before);
  });
});

test.describe('editable edges', () => {
  /** The screen position of the middle of an edge's path, by length. */
  const middleOf = (page: import('@playwright/test').Page, id: string) =>
    edge(page, id).evaluate((g) => {
      const path = g.querySelector('path') as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      const m = path.getScreenCTM() as DOMMatrix;
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
    });
  const pathOf = (page: import('@playwright/test').Page, id: string) =>
    edge(page, id).locator('path.react-flow__edge-path').getAttribute('d');

  test('a waypoint is dragged out of the middle of an edge, moved, and double-clicked away', async ({ page }) => {
    await open(page, '?editable=1');
    const straight = await pathOf(page, 'e3-4');
    const at = await middleOf(page, 'e3-4');
    await page.mouse.click(at.x, at.y); // selects it
    const midpoint = edge(page, 'e3-4').locator('.flowinger-edge-midpoint').first();
    await expect(midpoint).toBeVisible();

    // Drag the middle sideways: a waypoint is made where the pointer is, and the edge bends through it.
    const m = await centre(midpoint);
    await drag(page, m, { x: m.x + 140, y: m.y }, 8);
    const point = edge(page, 'e3-4').locator('.flowinger-edge-point');
    await expect(point).toHaveCount(1);
    expect(await pathOf(page, 'e3-4')).not.toBe(straight);
    const p0 = await centre(point);
    expect(Math.abs(p0.x - (m.x + 140))).toBeLessThan(2);

    // Move it again, and the node it joins did not move, nor the view.
    const before = await view(page);
    await drag(page, p0, { x: p0.x - 60, y: p0.y - 30 }, 6);
    const p1 = await centre(point);
    expect(Math.abs(p1.x - (p0.x - 60))).toBeLessThan(2);
    expect(await view(page)).toEqual(before);

    await point.dblclick();
    await expect(point).toHaveCount(0);
    expect(await pathOf(page, 'e3-4')).toBe(straight);
  });
});
