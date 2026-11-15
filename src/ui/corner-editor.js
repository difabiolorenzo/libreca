/**
 * Manual corner adjustment (fallback when detection is wrong): shows the
 * captured photo in a dialog with four draggable handles. Works with mouse,
 * touch and keyboard (arrow keys move the focused corner). Without dragging
 * (WCAG 2.5.7): tap a corner to choose it, then tap the photo where it goes;
 * before any choice, the tap moves the nearest corner.
 */

import { FULL_QUAD, clamp01, orderCorners } from '../pipeline/geometry.js';
import { t } from '../i18n/i18n.js';

/** @typedef {import('../pipeline/geometry.js').Point} Point */
/** @typedef {import('../pipeline/geometry.js').Quad} Quad */

const KEY_STEP = 0.005;

/** Translation keys of the handles, in their order in the dialog. */
const CORNER_NAMES = ['corners.topLeft', 'corners.topRight', 'corners.bottomRight', 'corners.bottomLeft'];

export class CornerEditor {
  /** @param {HTMLDialogElement} dialog */
  constructor(dialog) {
    this.dialog = dialog;
    this.stage = /** @type {HTMLElement} */ (dialog.querySelector('.corner-stage'));
    this.img = /** @type {HTMLImageElement} */ (this.stage.querySelector('img'));
    this.polygon = /** @type {SVGPolygonElement} */ (this.stage.querySelector('polygon'));
    this.handles = /** @type {HTMLButtonElement[]} */ ([...this.stage.querySelectorAll('.handle')]);
    /** @type {Point[]} */
    this.points = FULL_QUAD.map((p) => ({ ...p }));
    /** @type {Quad | null} */
    this.result = null;
    /** @type {((quad: Quad | null) => void) | null} */
    this.resolve = null;
    this.url = '';
    /** @type {number} corner chosen for a tap on the photo, -1: the nearest */
    this.active = -1;

    this.handles.forEach((handle, i) => this.bindHandle(handle, i));
    this.stage.addEventListener('pointerdown', (event) => this.onStageTap(event));
    dialog.addEventListener('click', (event) => {
      const action = /** @type {HTMLElement} */ (event.target).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'reset') this.setPoints(FULL_QUAD);
      if (action === 'cancel') this.finish(null);
      if (action === 'apply') this.finish(orderCorners(this.points));
    });
    dialog.addEventListener('close', () => {
      URL.revokeObjectURL(this.url);
      this.img.removeAttribute('src');
      this.resolve?.(this.result);
      this.resolve = null;
    });
  }

  /**
   * Open the editor. Resolves with the new corners, or null if cancelled.
   * @param {Blob} photo original (uncorrected) capture
   * @param {readonly Point[]} quad current corners, normalized
   * @returns {Promise<Quad | null>}
   */
  open(photo, quad) {
    this.url = URL.createObjectURL(photo);
    this.img.src = this.url;
    this.result = null;
    this.setPoints(quad);
    this.dialog.showModal();
    this.setActive(-1); // the dialog's initial focus on a handle is not a choice
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  /** @param {Quad | null} result */
  finish(result) {
    this.result = result;
    this.dialog.close();
  }

  /** @param {readonly Point[]} points */
  setPoints(points) {
    this.points = points.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
    this.render();
  }

  render() {
    this.points.forEach((p, i) => {
      const handle = this.handles[i];
      handle.style.left = `${p.x * 100}%`;
      handle.style.top = `${p.y * 100}%`;
      // The position is part of the name, for screen readers.
      handle.setAttribute('aria-label', t('corners.position', {
        name: t(CORNER_NAMES[i]), x: Math.round(p.x * 100), y: Math.round(p.y * 100),
      }));
    });
    this.polygon.setAttribute('points', this.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' '));
  }

  /**
   * @param {HTMLButtonElement} handle
   * @param {number} index
   */
  bindHandle(handle, index) {
    /** @param {PointerEvent} event */
    const move = (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const rect = this.stage.getBoundingClientRect();
      this.points[index] = {
        x: clamp01((event.clientX - rect.left) / rect.width),
        y: clamp01((event.clientY - rect.top) / rect.height),
      };
      this.render();
    };
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation(); // not a tap on the photo
      handle.focus();
      this.setActive(index);
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('focus', () => this.setActive(index));
    handle.addEventListener('pointermove', move);
    handle.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? KEY_STEP * 5 : KEY_STEP;
      /** @type {Record<string, [number, number]>} */
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const delta = moves[event.key];
      if (!delta) return;
      event.preventDefault();
      const p = this.points[index];
      this.points[index] = { x: clamp01(p.x + delta[0]), y: clamp01(p.y + delta[1]) };
      this.render();
    });
  }

  /** @param {number} index corner chosen for the next tap on the photo, -1 for none */
  setActive(index) {
    this.active = index;
    this.handles.forEach((h, i) => h.classList.toggle('is-active', i === index));
  }

  /**
   * A tap on the photo (not on a handle) places the chosen corner there,
   * or the nearest one when none was chosen.
   * @param {PointerEvent} event
   */
  onStageTap(event) {
    if (event.button > 0) return;
    const rect = this.stage.getBoundingClientRect();
    const point = { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) };
    const chosen = this.active;
    const index = chosen >= 0 ? chosen : nearestCorner(this.points, point);
    this.points[index] = point;
    this.render();
    this.handles[index].focus({ preventScroll: true }); // arrow keys can fine-tune it
    this.setActive(chosen); // that focus is not a choice
  }
}

/**
 * Index of the point closest to p.
 * @param {readonly Point[]} points
 * @param {Point} p
 */
export function nearestCorner(points, p) {
  let best = 0;
  points.forEach((q, i) => {
    if (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(points[best].x - p.x, points[best].y - p.y)) best = i;
  });
  return best;
}
