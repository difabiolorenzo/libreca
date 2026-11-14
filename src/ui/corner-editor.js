/**
 * Manual corner adjustment (fallback when detection is wrong): shows the
 * captured photo in a dialog with four draggable handles. Works with mouse,
 * touch and keyboard (arrow keys move the focused corner).
 */

import { FULL_QUAD, clamp01, orderCorners } from '../pipeline/geometry.js';

/** @typedef {import('../pipeline/geometry.js').Point} Point */
/** @typedef {import('../pipeline/geometry.js').Quad} Quad */

const KEY_STEP = 0.005;

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

    this.handles.forEach((handle, i) => this.bindHandle(handle, i));
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
      this.handles[i].style.left = `${p.x * 100}%`;
      this.handles[i].style.top = `${p.y * 100}%`;
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
      handle.focus();
      handle.setPointerCapture(event.pointerId);
    });
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
}
