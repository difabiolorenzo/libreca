/**
 * Developer tool, not part of the app: quick accessibility checks of what
 * is on screen (WCAG 2.2 AA). In the browser console of the running app:
 *
 *   const { check } = await import('/tools/a11y-check.js'); check();
 *
 * Reports, for the visible elements only:
 * - text whose contrast with its background is below 4.5:1 (3:1 for large text), 1.4.3;
 * - buttons, links and form fields without an accessible name, 4.1.2;
 * - pointer targets smaller than 24 × 24 CSS pixels, 2.5.8;
 * - duplicate ids and aria references to missing ids, 4.1.2.
 * It does not replace a keyboard pass and a screen reader.
 */

/** @param {string} color rgb() or rgba() */
function parse(color) {
  const [r, g, b, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return { r, g, b, a };
}

/** @param {{ r: number, g: number, b: number }} c */
function luminance({ r, g, b }) {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Ratio between two opaque colours. */
export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** @param {{ r: number, g: number, b: number, a: number }} top @param {{ r: number, g: number, b: number }} under */
const blend = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
});

/** Background behind an element: its own and its ancestors' colours, blended. */
function backgroundOf(el) {
  /** @type {{ r: number, g: number, b: number, a: number }[]} */
  const layers = [];
  for (let node = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== 'none' && node !== el) return null; // image or gradient: unknown
    const c = parse(style.backgroundColor);
    if (c.a > 0) layers.push(c);
    if (c.a >= 1) break;
  }
  let color = { r: 255, g: 255, b: 255 };
  for (const layer of layers.reverse()) color = blend(layer, color);
  return color;
}

/** @param {Element} el */
function visible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true;
}

/** @param {Element} el */
function accessibleName(el) {
  const labelled = el.getAttribute('aria-labelledby');
  if (labelled) return labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  const label = el.getAttribute('aria-label') ?? '';
  if (label.trim()) return label.trim();
  if ('labels' in el && el.labels?.length) return [...el.labels].map((l) => l.textContent).join(' ').trim();
  const text = (el.textContent ?? '').trim();
  if (text) return text;
  const img = el.querySelector('img[alt]:not([alt=""])');
  return img?.getAttribute('alt') ?? el.getAttribute('title') ?? '';
}

/** @param {Element} el */
const describe = (el) => {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${[...el.classList].join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls} « ${(el.textContent ?? '').trim().slice(0, 40)} »`;
};

/**
 * @param {ParentNode} [root]
 * @returns {{ contrast: string[], names: string[], targets: string[], ids: string[] }}
 */
export function check(root = document) {
  const contrast = [];
  for (const el of root.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
    if (!ownText) continue;
    if (el.closest(':disabled, [aria-disabled="true"]')) continue; // inactive controls are exempt
    const style = getComputedStyle(el);
    const bg = backgroundOf(el);
    if (!bg) continue;
    const fg = blend(parse(style.color), bg);
    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const value = ratio(fg, bg);
    const min = large ? 3 : 4.5;
    if (value < min) contrast.push(`${value.toFixed(2)}:1 < ${min} ${describe(el)}`);
  }

  const names = [];
  const interactive = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="slider"], [tabindex]:not([tabindex="-1"])';
  for (const el of root.querySelectorAll(interactive)) {
    if (!visible(el)) continue;
    if (!accessibleName(el)) names.push(describe(el));
  }

  const targets = [];
  for (const el of root.querySelectorAll(interactive)) {
    if (!visible(el) || el.matches('a') && getComputedStyle(el).display === 'inline') continue; // inline links are exempt
    const { width, height } = el.getBoundingClientRect();
    if (width < 24 || height < 24) targets.push(`${Math.round(width)} × ${Math.round(height)} ${describe(el)}`);
  }

  const ids = [];
  const seen = new Map();
  for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
  for (const [id, count] of seen) if (count > 1) ids.push(`id « ${id} » ×${count}`);
  for (const el of document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]')) {
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) ids.push(`${attr}="${id}" introuvable sur ${describe(el)}`);
      }
    }
  }
  return { contrast, names, targets, ids };
}
