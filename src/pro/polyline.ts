export interface Point {
  x: number;
  y: number;
}

/** The corners of the route as a path, each rounded by up to `radius`, and its midpoint by length. */
export function polylinePath(points: Point[], radius: number): { path: string; mid: Point } {
  // Collapse repeated points and points on a straight run.
  const pts: Point[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const before = pts[pts.length - 2];
    if (last && before && ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))) {
      pts[pts.length - 1] = p;
    } else {
      pts.push(p);
    }
  }
  const n = (v: number) => String(Math.round(v * 100) / 100);
  let path = `M ${n((pts[0] as Point).x)} ${n((pts[0] as Point).y)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as Point;
    const prev = pts[i - 1] as Point;
    const next = pts[i + 1];
    if (!next) {
      path += ` L ${n(p.x)} ${n(p.y)}`;
      break;
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r <= 0) {
      // Square corner: nothing to round.
      path += ` L ${n(p.x)} ${n(p.y)}`;
      continue;
    }
    const ax = p.x - ((p.x - prev.x) / inLen) * r;
    const ay = p.y - ((p.y - prev.y) / inLen) * r;
    const bx = p.x + ((next.x - p.x) / outLen) * r;
    const by = p.y + ((next.y - p.y) / outLen) * r;
    path += ` L ${n(ax)} ${n(ay)} Q ${n(p.x)} ${n(p.y)} ${n(bx)} ${n(by)}`;
  }

  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot((pts[i] as Point).x - (pts[i - 1] as Point).x, (pts[i] as Point).y - (pts[i - 1] as Point).y);
  }
  let left = total / 2;
  let mid = pts[0] as Point;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len && len > 0) {
      mid = { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
      break;
    }
    left -= len;
  }
  return { path, mid };
}
