/**
 * Generated cover: a title page drawn with the app's fonts (title in
 * Fraunces, author in Inter) on paper, turned into a JPEG that the PDF
 * writer places first. Used when the book has no cover photo.
 */

/**
 * Colours of the Papier theme (src/styles/tokens.css): the cover keeps the
 * light look whatever the interface theme.
 */
const COLORS = { paper: '#FFFDF8', ink: '#1B1A17', muted: '#5C574E', accent: '#C2410C' };

/**
 * Split a text into lines no wider than maxWidth, at spaces. A word wider
 * than maxWidth stays alone on its line (the caller then shrinks the font).
 * @param {string} text
 * @param {number} maxWidth
 * @param {(text: string) => number} measure width of a text at the current font
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, measure) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @typedef {object} TextBlock
 * @property {number} size font size in pixels
 * @property {string[]} lines
 */

/**
 * Largest font size (from max down to min) at which the text fits in at
 * most maxLines lines of maxWidth; at min size, whatever it gives.
 * @param {string} text
 * @param {{ maxWidth: number, maxLines: number, max: number, min: number }} box
 * @param {(text: string, size: number) => number} measure width of a text at a font size
 * @returns {TextBlock}
 */
export function fitText(text, { maxWidth, maxLines, max, min }, measure) {
  for (let size = max; size > min; size = Math.max(min, Math.floor(size * 0.9))) {
    const lines = wrapText(text, maxWidth, (s) => measure(s, size));
    if (lines.length <= maxLines && lines.every((l) => measure(l, size) <= maxWidth)) return { size, lines };
  }
  return { size: min, lines: wrapText(text, maxWidth, (s) => measure(s, min)) };
}

/**
 * Draw the cover and encode it as JPEG.
 * @param {{ title: string, author?: string, width: number, height: number }} options
 *   width and height in pixels (same ratio as the book pages)
 * @returns {Promise<Uint8Array>}
 */
export async function renderCover({ title, author = '', width, height }) {
  // The fonts are local (fonts.css); wait for them, or the canvas falls
  // back to Georgia / system-ui.
  await Promise.all([
    document.fonts.load(`600 ${Math.round(width / 10)}px Fraunces`, title),
    author ? document.fonts.load(`400 ${Math.round(width / 24)}px Inter`, author) : null,
  ]).catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxWidth = width * 0.76;
  const serif = (size) => `600 ${size}px Fraunces, Georgia, serif`;
  const sans = (size) => `400 ${size}px Inter, system-ui, sans-serif`;
  /** @param {(size: number) => string} font */
  const measureWith = (font) => (text, size) => {
    ctx.font = font(size);
    return ctx.measureText(text).width;
  };

  const titleBlock = fitText(title, { maxWidth, maxLines: 5, max: Math.round(width / 9), min: Math.round(width / 28) }, measureWith(serif));
  const authorBlock = author
    ? fitText(author, { maxWidth, maxLines: 2, max: Math.round(width / 22), min: Math.round(width / 40) }, measureWith(sans))
    : null;

  // Title, accent rule, author: one block, centred a little above the middle.
  const titleLead = titleBlock.size * 1.15;
  const authorLead = authorBlock ? authorBlock.size * 1.4 : 0;
  const gap = width * 0.06;
  const ruleHeight = Math.max(2, Math.round(width / 200));
  const blockHeight = titleBlock.lines.length * titleLead
    + (authorBlock ? gap * 2 + ruleHeight + authorBlock.lines.length * authorLead : 0);
  let y = Math.max(height * 0.12, height * 0.42 - blockHeight / 2);

  ctx.fillStyle = COLORS.ink;
  ctx.font = serif(titleBlock.size);
  for (const line of titleBlock.lines) {
    y += titleLead;
    ctx.fillText(line, width / 2, y - titleLead * 0.22);
  }
  if (authorBlock) {
    y += gap;
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(width / 2 - width * 0.06, y, width * 0.12, ruleHeight);
    y += ruleHeight + gap;
    ctx.fillStyle = COLORS.muted;
    ctx.font = sans(authorBlock.size);
    for (const line of authorBlock.lines) {
      y += authorLead;
      ctx.fillText(line, width / 2, y - authorLead * 0.3);
    }
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('cover not encoded'))), 'image/jpeg', 0.92);
  });
  return new Uint8Array(await /** @type {Blob} */ (blob).arrayBuffer());
}
