/**
 * Captured pages of the book in progress, kept in memory for now (saving
 * comes later in v0.3). The screens draw them; this only holds the data.
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

export class PageList {
  /** @param {() => void} onChange called after every change */
  constructor(onChange) {
    this.onChange = onChange;
    /** @type {Page[]} */
    this.pages = [];
    this.nextId = 1;
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
    this.onChange();
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
    this.onChange();
  }

  /** @param {number} id */
  remove(id) {
    const index = this.pages.findIndex((p) => p.id === id);
    if (index < 0) return;
    URL.revokeObjectURL(this.pages[index].url);
    URL.revokeObjectURL(this.pages[index].beforeUrl);
    this.pages.splice(index, 1);
    this.onChange();
  }
}
