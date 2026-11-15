/**
 * Plain geometry helpers for page quadrilaterals. No OpenCV here, so this
 * runs anywhere (main thread, worker, Node tests).
 *
 * A quad is stored in normalized coordinates (0..1 of the image width and
 * height), so it stays valid whatever the image resolution.
 */

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {[Point, Point, Point, Point]} Quad corners: top-left, top-right, bottom-right, bottom-left */

/** The whole image, as a quad. @type {Readonly<Quad>} */
export const FULL_QUAD = Object.freeze([
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
]);

/** @param {number} v */
export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * @param {Point} a
 * @param {Point} b
 */
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Order 4 points as top-left, top-right, bottom-right, bottom-left
 * (clockwise on screen, y pointing down), whatever their input order.
 * @param {readonly Point[]} points exactly 4 points
 * @returns {Quad}
 */
export function orderCorners(points) {
  if (points.length !== 4) throw new RangeError('a quad needs 4 points');
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  // Sorting by angle around the centroid gives a clockwise loop without
  // crossings; then start from the corner closest to the top-left.
  const loop = points
    .map((p) => ({ x: p.x, y: p.y }))
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (loop[i].x + loop[i].y < loop[start].x + loop[start].y) start = i;
  }
  return /** @type {Quad} */ ([0, 1, 2, 3].map((i) => loop[(start + i) % 4]));
}

/**
 * Area of a polygon (shoelace formula), always positive.
 * @param {readonly Point[]} points
 */
export function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Convert a normalized quad to pixel coordinates.
 * @param {readonly Point[]} quad
 * @param {number} width
 * @param {number} height
 * @returns {Quad}
 */
export function toPixels(quad, width, height) {
  return /** @type {Quad} */ (quad.map((p) => ({ x: p.x * width, y: p.y * height })));
}

/**
 * Convert pixel points to normalized coordinates.
 * @param {readonly Point[]} points
 * @param {number} width
 * @param {number} height
 * @returns {Point[]}
 */
export function toNormalized(points, width, height) {
  return points.map((p) => ({ x: clamp01(p.x / width), y: clamp01(p.y / height) }));
}

/** @typedef {{ point: Point, dir: Point }} Line point on the line + unit direction */

/**
 * Best-fit line through points (total least squares: perpendicular
 * distances, so vertical lines work too).
 * @param {readonly Point[]} points at least 2
 * @returns {Line}
 */
export function fitLine(points) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const angle = Math.atan2(2 * sxy, sxx - syy) / 2; // main axis of the cloud
  return { point: { x: mx, y: my }, dir: { x: Math.cos(angle), y: Math.sin(angle) } };
}

/**
 * Distance from a point to an infinite line.
 * @param {Point} p
 * @param {Line} line
 */
export function lineDistance(p, { point, dir }) {
  return Math.abs((p.x - point.x) * dir.y - (p.y - point.y) * dir.x);
}

/**
 * Intersection of two lines, or null when they are (nearly) parallel.
 * @param {Line} a
 * @param {Line} b
 * @returns {Point | null}
 */
export function intersectLines(a, b) {
  const cross = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  if (Math.abs(cross) < 1e-6) return null;
  const t = ((b.point.x - a.point.x) * b.dir.y - (b.point.y - a.point.y) * b.dir.x) / cross;
  return { x: a.point.x + t * a.dir.x, y: a.point.y + t * a.dir.y };
}

/**
 * Refine a rough quad with the outline points: fit a line on the points
 * along each side, then intersect neighbouring sides. This straightens
 * sides bent by noise and recovers a corner hidden by a finger.
 * @param {Quad} quad rough corners (ordered), pixels
 * @param {readonly Point[]} points outline points, pixels
 * @param {number} tolerance max distance from a side to belong to it, pixels
 * @returns {Quad}
 */
export function refineQuad(quad, points, tolerance) {
  const lines = quad.map((a, i) => {
    const b = quad[(i + 1) % 4];
    /** @type {Line} */
    let line = { point: a, dir: { x: (b.x - a.x) / distance(a, b), y: (b.y - a.y) / distance(a, b) } };
    // Pass 1: wide band, middle of the side only (near the ends, the
    // neighbouring sides would pull the fit). Pass 2: narrow band around
    // the first fit, whole side.
    const len = distance(a, b);
    const passes = [
      { band: tolerance * 1.5, from: 0.15 * len, to: 0.85 * len },
      { band: tolerance / 3, from: -tolerance, to: len + tolerance },
    ];
    for (const { band, from, to } of passes) {
      const near = points.filter((p) => {
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len;
        return t >= from && t <= to && lineDistance(p, line) <= band;
      });
      if (near.length < 8) break;
      line = fitLine(near);
    }
    return line;
  });
  const maxShift = distance(quad[0], quad[2]) * 0.25;
  return /** @type {Quad} */ (quad.map((corner, i) => {
    const p = intersectLines(lines[(i + 3) % 4], lines[i]);
    return p && distance(p, corner) <= maxShift ? p : corner;
  }));
}

/**
 * Output size of a straightened quad (in pixels): the longest of each pair
 * of opposite edges, so no detail is lost.
 * @param {Quad} px quad in pixels, ordered
 * @returns {{ width: number, height: number }}
 */
export function quadSize([tl, tr, br, bl]) {
  return {
    width: Math.max(1, Math.round(Math.max(distance(tl, tr), distance(bl, br)))),
    height: Math.max(1, Math.round(Math.max(distance(tl, bl), distance(tr, br)))),
  };
}

/**
 * Point of a quad seen in perspective, from coordinates on the flat page:
 * (0, 0) is the top-left corner, (1, 1) the bottom-right one. Exact
 * projective mapping (square to quad), so 0.5 lands on the true middle of
 * the page, not on the middle of its foreshortened edge.
 * @param {Quad} quad ordered corners (TL, TR, BR, BL), any unit
 * @param {number} u across, 0..1
 * @param {number} v down, 0..1
 * @returns {Point}
 */
export function squareToQuad([p0, p1, p2, p3], u, v) {
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if ((dx3 !== 0 || dy3 !== 0) && den !== 0) {
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const w = g * u + h * v + 1;
  return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w };
}

/**
 * Split a double page at the binding into its left and right pages.
 * @param {Quad} quad ordered corners of the double page
 * @param {number} gutter position of the binding across the flat page, 0..1
 * @returns {[Quad, Quad]} left page, right page (ordered corners)
 */
export function splitQuad(quad, gutter) {
  const [tl, tr, br, bl] = quad;
  const top = squareToQuad(quad, gutter, 0);
  const bottom = squareToQuad(quad, gutter, 1);
  return [[tl, top, bottom, bl], [top, tr, br, bottom]];
}

/**
 * Viewfinder brackets drawn on a detected page: for each corner, a short
 * line along each of its two sides, `[toPrevious, corner, toNext]`.
 * `spread` > 1 pushes the brackets out from the page center (used to animate
 * them closing in on the page).
 * @param {readonly Point[]} quad corners in order (any unit)
 * @param {{ spread?: number, ratio?: number, maxLength?: number }} [options]
 *   ratio: bracket length as a fraction of the shorter adjacent side
 * @returns {[Point, Point, Point][]}
 */
export function viewfinderCorners(quad, { spread = 1, ratio = 0.2, maxLength = Infinity } = {}) {
  const n = quad.length;
  const cx = quad.reduce((s, p) => s + p.x, 0) / n;
  const cy = quad.reduce((s, p) => s + p.y, 0) / n;
  const pts = quad.map((p) => ({ x: cx + (p.x - cx) * spread, y: cy + (p.y - cy) * spread }));
  return pts.map((corner, i) => {
    const prev = pts[(i + n - 1) % n];
    const next = pts[(i + 1) % n];
    const length = Math.min(maxLength, ratio * Math.min(distance(corner, prev), distance(corner, next)));
    /** @param {Point} to */
    const toward = (to) => {
      const d = distance(corner, to) || 1;
      return { x: corner.x + ((to.x - corner.x) / d) * length, y: corner.y + ((to.y - corner.y) / d) * length };
    };
    return [toward(prev), corner, toward(next)];
  });
}
