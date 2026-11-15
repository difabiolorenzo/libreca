/**
 * Pages of the open book. The screens draw them and main.js saves them
 * (lib/store.js) on every change; this only holds the data.
 */

/** @typedef {import('../pipeline/geometry.js').Quad} Quad */
/** @typedef {import('../lib/orientation.js').Orientation} Orientation */
/** @typedef {import('../pipeline/enhance.js').Corrections} Corrections */

/**
 * @typedef {object} Page
 * @property {number} id
 * @property {Blob} photo original capture (JPEG), kept to adjust corners later
 * @property {Quad} quad corners used, normalized
 * @property {boolean} detected false when no page outline was found (to retake or adjust)
 * @property {Blob} straight straightened page, before corrections and orientation (JPEG)
 * @property {Blob} enhanced straightened page with its corrections, before orientation (JPEG)
 * @property {Corrections} corrections corrections chosen for this page
 * @property {Record<string, boolean>} applied corrections that changed something
 * @property {Orientation} orientation rotation and mirror chosen for this page
 * @property {Blob} before straightened page with the orientation, no corrections (JPEG)
 * @property {string} beforeUrl object URL of `before`, for the before/after comparison
 * @property {Blob} image corrected and oriented page (JPEG), shown and exported
 * @property {string} url object URL of `image`, for the thumbnails
 */

/**
 * @typedef {object} PageData
 * @property {Blob} photo
 * @property {Quad} quad
 * @property {boolean} detected
 * @property {Blob} straight
 * @property {Blob} enhanced
 * @property {Corrections} corrections
 * @property {Record<string, boolean>} applied
 * @property {Blob} image
 */

/** @typedef {Omit<Page, 'url' | 'beforeUrl'>} PageRecord a page as saved (no object URLs) */

/**
 * @typedef {{ type: 'add' | 'update', page: Page } | { type: 'remove', id: number }
 *   | { type: 'move' } | { type: 'load' }} PageChange
 */

/**
 * Move an item of an array to another index (in place).
 * @template T
 * @param {T[]} list
 * @param {number} from
 * @param {number} to clamped to the list
 * @returns {boolean} true if something moved
 */
export function moveItem(list, from, to) {
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (from < 0 || from >= list.length || from === target) return false;
  const [item] = list.splice(from, 1);
  list.splice(target, 0, item);
  return true;
}

export class PageList {
  /** @param {(change: PageChange) => void} onChange called after every change */
  constructor(onChange) {
    this.onChange = onChange;
    /** @type {Page[]} */
    this.pages = [];
    this.nextId = 1;
  }

  /**
   * Replace all pages (a saved book being opened).
   * @param {PageRecord[]} records in reading order
   * @param {number} nextId
   */
  load(records, nextId) {
    for (const page of this.pages) this.revoke(page);
    this.pages = records.map((r) => ({ ...r, url: URL.createObjectURL(r.image), beforeUrl: URL.createObjectURL(r.before) }));
    this.nextId = Math.max(nextId, ...records.map((r) => r.id + 1), 1);
    this.onChange({ type: 'load' });
  }

  /**
   * @param {PageData} data
   * @param {number} [index] position in the book (default: at the end)
   * @returns {Page}
   */
  add(data, index = this.pages.length) {
    /** @type {Page} */
    const page = {
      ...data, id: this.nextId++, orientation: { rotation: 0, mirror: false },
      before: data.straight, beforeUrl: URL.createObjectURL(data.straight), url: URL.createObjectURL(data.image),
    };
    this.pages.splice(index, 0, page);
    this.onChange({ type: 'add', page });
    return page;
  }

  /** @param {number} id */
  get(id) {
    return this.pages.find((p) => p.id === id);
  }

  /** @param {number} id 1-based position in the book, 0 if absent */
  numberOf(id) {
    return this.pages.findIndex((p) => p.id === id) + 1;
  }

  /**
   * Replace the images after a corner adjustment (the corners are then set
   * by hand, so the page no longer needs retaking), a new orientation or
   * other corrections.
   * @param {number} id
   * @param {Partial<Omit<Page, 'id' | 'url' | 'beforeUrl'>> & { image: Blob }} data
   */
  update(id, data) {
    const page = this.get(id);
    if (!page) return;
    URL.revokeObjectURL(page.url);
    if (data.before) URL.revokeObjectURL(page.beforeUrl);
    Object.assign(page, data, { url: URL.createObjectURL(data.image) });
    if (data.before) page.beforeUrl = URL.createObjectURL(data.before);
    if (data.quad) page.detected = true;
    this.onChange({ type: 'update', page });
  }

  /**
   * Move a page to another position (0-based).
   * @param {number} id
   * @param {number} index
   */
  move(id, index) {
    if (moveItem(this.pages, this.numberOf(id) - 1, index)) this.onChange({ type: 'move' });
  }

  /** @param {number} id */
  remove(id) {
    const index = this.pages.findIndex((p) => p.id === id);
    if (index < 0) return;
    this.revoke(this.pages[index]);
    this.pages.splice(index, 1);
    this.onChange({ type: 'remove', id });
  }

  /** @param {Page} page */
  revoke(page) {
    URL.revokeObjectURL(page.url);
    URL.revokeObjectURL(page.beforeUrl);
  }
}

/**
 * The page as saved, without its object URLs.
 * @param {Page} page
 * @returns {PageRecord}
 */
export function toRecord({ url, beforeUrl, ...record }) {
  return record;
}
