/**
 * Drag and drop to reorder a list, with the mouse or a finger (pointer
 * events: HTML drag and drop does not work on Android). The Up / Down
 * buttons next to each item remain the keyboard and screen reader way.
 *
 * Items are `<li data-id>`; dragging starts on a `[data-drag]` element once
 * the pointer has moved a little, so a simple tap still works as a click.
 */

/** Pointer travel (px) before a press becomes a drag. */
const DRAG_START = 8;

/**
 * @param {HTMLElement} list
 * @param {(id: number, index: number) => void} onMove id of the item, new 0-based index
 */
export function enableDragReorder(list, onMove) {
  /** @type {{ item: HTMLElement, x: number, y: number, pointer: number, dragging: boolean } | null} */
  let press = null;
  /** @type {HTMLElement | null} */
  let target = null;
  let suppressClick = false;

  /** @param {number} x @param {number} y */
  const itemAt = (x, y) => /** @type {HTMLElement | null} */ (document.elementFromPoint(x, y)?.closest('li[data-id]') ?? null);

  const clear = () => {
    press?.item.classList.remove('is-dragging');
    target?.classList.remove('is-drop-target');
    press = null;
    target = null;
  };

  list.addEventListener('pointerdown', (event) => {
    const handle = /** @type {HTMLElement} */ (event.target).closest?.('[data-drag]');
    const item = handle?.closest('li[data-id]');
    if (!handle || !item || event.button !== 0) return;
    press = { item: /** @type {HTMLElement} */ (item), x: event.clientX, y: event.clientY, pointer: event.pointerId, dragging: false };
  });

  list.addEventListener('pointermove', (event) => {
    if (!press || event.pointerId !== press.pointer) return;
    if (!press.dragging) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_START) return;
      press.dragging = true;
      press.item.classList.add('is-dragging');
      list.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const over = itemAt(event.clientX, event.clientY);
    const next = over && over !== press.item && list.contains(over) ? over : null;
    if (next !== target) {
      target?.classList.remove('is-drop-target');
      next?.classList.add('is-drop-target');
      target = next;
    }
  });

  list.addEventListener('pointerup', (event) => {
    if (!press || event.pointerId !== press.pointer) return;
    if (press.dragging) {
      suppressClick = true;
      if (target) {
        const items = [...list.querySelectorAll('li[data-id]')];
        onMove(Number(press.item.dataset.id), items.indexOf(target));
      }
    }
    clear();
  });

  list.addEventListener('pointercancel', clear);

  // The click that ends a drag must not open the page.
  list.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}
