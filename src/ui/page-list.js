/**
 * Captured pages of the book in progress, kept in memory for now (saving
 * comes in v0.3). The screens draw them; this only holds the data.
 */

/** @typedef {import('../pipeline/geometry.js').Quad} Quad */

/**
 * @typedef {object} Page
 * @property {number} id
 * @property {Blob} photo original capture (JPEG), kept to adjust corners later
 * @property {Quad} quad corners used, normalized
 * @property {boolean} detected false when no page outline was found (to retake or adjust)
 * @property {Blob} image straightened page (JPEG)
 * @property {string} url object URL of `image`, for the thumbnails
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
   * @param {{ photo: Blob, quad: Quad, image: Blob, detected: boolean }} data
   * @returns {Page}
   */
  add({ photo, quad, image, detected }) {
    const page = { id: this.nextId++, photo, quad, image, detected, url: URL.createObjectURL(image) };
    this.pages.push(page);
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
   * Replace the straightened image after a corner adjustment (the corners
   * are then set by hand, so the page no longer needs retaking).
   * @param {number} id
   * @param {{ quad: Quad, image: Blob }} data
   */
  update(id, { quad, image }) {
    const page = this.get(id);
    if (!page) return;
    URL.revokeObjectURL(page.url);
    Object.assign(page, { quad, image, detected: true, url: URL.createObjectURL(image) });
    this.onChange();
  }

  /** @param {number} id */
  remove(id) {
    const index = this.pages.findIndex((p) => p.id === id);
    if (index < 0) return;
    URL.revokeObjectURL(this.pages[index].url);
    this.pages.splice(index, 1);
    this.onChange();
  }
}
