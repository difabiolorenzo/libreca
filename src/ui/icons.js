/**
 * Libreca's own icon set, no dependency: 24px grid, 2px stroke, round caps
 * and joins, `currentColor`. Same drawing as the logo (book, viewfinder
 * corners).
 *
 * In HTML: `<span data-icon="close"></span>`, replaced by `applyIcons()`.
 * In JavaScript: `createIcon('close')`.
 * Icons are decorative (`aria-hidden`): the button or text around them
 * carries the name (`aria-label` on icon-only buttons).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Path data per icon, on a 24 × 24 grid. */
export const ICONS = /** @type {const} */ ({
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  plus: 'M12 5v14M5 12h14',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0zM12 11v5M12 7.5v.01',
  warning: 'M12 4L2.5 20h19L12 4zM12 10v4M12 17.5v.01',
  danger: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0zM15 9l-6 6M9 9l6 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  retake: 'M4 4v5h5M4.7 15.3A8 8 0 1 0 6.3 6.3L4 9',
  corners: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  book: 'M12 7c-2-1.4-4.5-1.7-7-1.4v11c2.5-.3 5 0 7 1.4 2-1.4 4.5-1.7 7-1.4v-11c-2.5-.3-5 0-7 1.4zM12 7v11',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 1 1 7 0z',
  export: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  auto: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16v4M17 18h4',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L4 14.5a1.5 1.5 0 0 1 2.5-1.6L8 15',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  'rotate-left': 'M4 4v5h5M4.6 9A8 8 0 1 1 5 15.5',
  'rotate-right': 'M20 4v5h-5M19.4 9A8 8 0 1 0 19 15.5',
  mirror: 'M12 3v18M9 7L3 17h6zM15 7l6 10h-6z',
  'switch-camera': 'M4 8h3l2-3h6l2 3h3v11H4zM9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2M14.5 9.5v1.5H13M9.5 16.5V15H11',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M18 7a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM10 17a2 2 0 1 1-4 0 2 2 0 1 1 4 0z',
});

/** @typedef {keyof typeof ICONS} IconName */

/**
 * @param {IconName} name
 * @returns {SVGSVGElement}
 */
export function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  svg.append(path);
  return svg;
}

/**
 * Replace every `[data-icon]` placeholder under root with its SVG icon.
 * @param {ParentNode} root
 */
export function applyIcons(root) {
  for (const el of root.querySelectorAll('span[data-icon]')) {
    el.replaceWith(createIcon(/** @type {IconName} */ (/** @type {HTMLElement} */ (el).dataset.icon)));
  }
}
