// Synthetic test images: a light "page" (with dark text lines) drawn as a
// quadrilateral on a dark, slightly noisy background, optionally with
// skin-coloured fingers. Used until real photos are added to tests/fixtures/.

/** @typedef {[number, number, number]} Rgb */

/**
 * @param {{x:number,y:number}[]} poly
 * @param {number} x
 * @param {number} y
 */
function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * Distance from a point to a segment.
 * @param {number} x @param {number} y
 * @param {{x1:number,y1:number,x2:number,y2:number}} s
 */
function segmentDistance(x, y, { x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/**
 * A finger (or arm): a capsule of radius r around a segment.
 * @typedef {{ x1: number, y1: number, x2: number, y2: number, r: number }} Finger
 */

/**
 * @param {number} width
 * @param {number} height
 * @param {{x:number,y:number}[] | null} page corners in pixels (TL, TR, BR, BL) or null
 * @param {{ background?: Rgb, paper?: Rgb, skin?: Rgb, fingers?: Finger[], seed?: number }} [options]
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function makePageImage(width, height, page, {
  background = [45, 45, 45], paper = [235, 235, 235], skin = [222, 168, 138], fingers = [], seed = 1,
} = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  let s = seed;
  const noise = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s % 21) - 10; };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = noise();
      /** @type {Rgb} */
      let rgb = background;
      let shade = n;
      if (page && inside(page, x + 0.5, y + 0.5)) {
        // Map to page-local coordinates (rough) to draw text lines.
        const [tl, , , bl] = page;
        const ty = (y - tl.y) / (bl.y - tl.y);
        const line = ty > 0.1 && ty < 0.9 && Math.floor(ty * 40) % 2 === 0 && (x * 7 + y) % 9 < 5;
        rgb = line ? [60, 60, 60] : paper;
        shade = line ? 0 : n / 2;
      }
      const finger = fingers.find((f) => segmentDistance(x + 0.5, y + 0.5, f) <= f.r);
      if (finger) {
        // Darker towards the finger's sides, like a real rounded finger.
        const d = segmentDistance(x + 0.5, y + 0.5, finger) / finger.r;
        rgb = skin;
        shade = n / 2 - 35 * d * d;
      }
      const i = (y * width + x) * 4;
      data[i] = rgb[0] + shade;
      data[i + 1] = rgb[1] + shade;
      data[i + 2] = rgb[2] + shade;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}
