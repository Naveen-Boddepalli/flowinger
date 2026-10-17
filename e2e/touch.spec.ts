// Touch, in a real browser: a finger's taps, drags and a two-finger pinch, sent through Chromium's DevTools
// protocol (`Input.dispatchTouchEvent`), which makes real touch-generated pointer events — what a phone sends,
// not a mouse. Playwright has no multi-touch of its own, and the protocol is Chromium's, so this runs there
// only; Safari on an iPhone and Chrome on Android are checked by hand (see PLAN-1.0.md, step 3).
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { centre, handle, node, open, paneBox, view } from './helpers.ts';

test.skip(({ browserName }) => browserName !== 'chromium', 'multi-touch goes through the Chromium DevTools protocol');
// A tablet's size: at a phone's, the demo's options panel covers the graph (the gestures would land on it).
test.use({ hasTouch: true, viewport: { width: 1280, height: 800 } });

type Point = { x: number; y: number };

/** Fingers on the screen: each step a list of points (one per finger), then all lifted. */
async function touch(cdp: CDPSession, frames: Point[][]): Promise<void> {
  const points = (frame: Point[]) => frame.map((p, id) => ({ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }));
  const [first, ...rest] = frames;
  if (!first) return;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(first) });
  for (const frame of rest) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(frame) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** From `a` to `b` in `steps` moves, one finger. */
const line = (a: Point, b: Point, steps = 10): Point[][] =>
  Array.from({ length: steps + 1 }, (_, i) => [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }]);

/** Where a node sits on screen: its viewport-relative transform, read from the DOM. */
const placeOf = (page: Page, id: string) =>
  node(page, id).evaluate((el) => (el as HTMLElement).style.transform);

/** A point of empty canvas, clear of the nodes and of the demo's panels (top right) and controls. */
async function emptySpot(page: Page): Promise<Point> {
  const pane = await paneBox(page);
  return { x: pane.x + 30, y: pane.y + pane.height / 2 };
}

let cdp: CDPSession;

test.beforeEach(async ({ page }) => {
  await open(page);
  cdp = await page.context().newCDPSession(page);
});

test('the canvas keeps touch gestures to itself: the page neither scrolls nor zooms under them', async ({ page }) => {
  // `touch-action: none` on the canvas: no browser pan, pinch-zoom or double-tap zoom on top of the canvas's own.
  expect(await page.locator('.react-flow').evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
});

test('a tap selects a node', async ({ page }) => {
  const at = await centre(node(page, '1'));
  await touch(cdp, [[at]]);
  await expect(node(page, '1')).toHaveClass(/selected/);
});

test('a finger dragged on a node moves it', async ({ page }) => {
  const before = await placeOf(page, '1');
  const viewBefore = await view(page);
  const at = await centre(node(page, '1'));
  await touch(cdp, line(at, { x: at.x + 60, y: at.y + 40 }));
  await expect.poll(() => placeOf(page, '1')).not.toBe(before);
  // …and only it: the view did not pan under the finger.
  expect(await view(page)).toEqual(viewBefore);
});

test('a finger dragged on the empty canvas pans the view', async ({ page }) => {
  const before = await view(page);
  const at = await emptySpot(page);
  await touch(cdp, line(at, { x: at.x + 80, y: at.y - 50 }));
  const after = await view(page);
  expect(after.x - before.x).toBeCloseTo(80, 0);
  expect(after.y - before.y).toBeCloseTo(-50, 0);
  expect(after.zoom).toBe(before.zoom);
});

test('two fingers spread apart zoom in about the point between them', async ({ page }) => {
  const before = await view(page);
  const pane = await paneBox(page);
  const mid = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
  // The graph point under the fingers' midpoint, before.
  const graphAt = (v: typeof before) => ({ x: (mid.x - pane.x - v.x) / v.zoom, y: (mid.y - pane.y - v.y) / v.zoom });
  const under = graphAt(before);

  const frames: Point[][] = Array.from({ length: 11 }, (_, i) => {
    const spread = 30 + i * 6; // 30 px apart on each side, to 90
    return [
      { x: mid.x - spread, y: mid.y },
      { x: mid.x + spread, y: mid.y },
    ];
  });
  await touch(cdp, frames);

  const after = await view(page);
  // Three times as far apart: three times the zoom, unless a limit stops it.
  expect(after.zoom).toBeGreaterThan(before.zoom * 1.5);
  // What was under the fingers is still under them.
  const stillUnder = graphAt(after);
  expect(stillUnder.x).toBeCloseTo(under.x, 0);
  expect(stillUnder.y).toBeCloseTo(under.y, 0);
});

test('two fingers pinched together zoom out', async ({ page }) => {
  const before = await view(page);
  const pane = await paneBox(page);
  const mid = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
  const frames: Point[][] = Array.from({ length: 11 }, (_, i) => {
    const spread = 120 - i * 8; // from 120 px a side to 40
    return [
      { x: mid.x, y: mid.y - spread },
      { x: mid.x, y: mid.y + spread },
    ];
  });
  await touch(cdp, frames);
  expect((await view(page)).zoom).toBeLessThan(before.zoom * 0.7);
});

test('a pinch that starts on a node zooms, and does not drag the node', async ({ page }) => {
  // On a phone the nodes fill the screen: a pinch has to work on top of them. The fingers counted only on the
  // bare pane once, so a pinch on a node did nothing.
  const before = await view(page);
  const place = await placeOf(page, '1');
  const at = await centre(node(page, '1'));
  const frames: Point[][] = Array.from({ length: 11 }, (_, i) => {
    const spread = 10 + i * 4; // both fingers on the node at first, then spreading out
    return [
      { x: at.x - spread, y: at.y },
      { x: at.x + spread, y: at.y },
    ];
  });
  await touch(cdp, frames);
  expect((await view(page)).zoom).toBeGreaterThan(before.zoom * 1.5);
  // The node is where it was in the graph — its own transform, not the view's, is unchanged.
  expect(await placeOf(page, '1')).toBe(place);
  // And the canvas is ready for the next gesture: one finger pans, it is not half a pinch.
  const v = await view(page);
  const spot = await emptySpot(page);
  await touch(cdp, line(spot, { x: spot.x + 40, y: spot.y }));
  expect((await view(page)).x - v.x).toBeCloseTo(40, 0);
});

test.describe('at a phone’s size', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a finger that lands near a handle, not on it, drags out a connection', async ({ page }) => {
    // Fitted to a phone, a 10 px handle is drawn at about 6: a fingertip mostly misses it. 12 px off is on it.
    const before = await page.locator('.react-flow__edge').count();
    const from = await centre(handle(page, '2', 'out'));
    const to = await centre(handle(page, '4', 'in'));
    await touch(cdp, line({ x: from.x + 4, y: from.y + 12 }, { x: to.x - 4, y: to.y - 12 }, 12));
    await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
  });

  test('a tap on the bare canvas puts the options away', async ({ page }) => {
    const options = page.locator('details');
    await expect(options).not.toHaveAttribute('open');
    await touch(cdp, [[await centre(page.locator('summary'))]]);
    await expect(options).toHaveAttribute('open');
    const pane = await paneBox(page);
    await touch(cdp, [[{ x: pane.x + 15, y: pane.y + 15 }]]);
    await expect(options).not.toHaveAttribute('open');
  });
});
