/**
 * Captured pages, kept in memory for now (saving comes in v0.3), and their
 * list in the interface.
 */

import { t } from '../i18n/i18n.js';

/** @typedef {import('../pipeline/geometry.js').Quad} Quad */

/**
 * @typedef {object} Page
 * @property {number} id
 * @property {Blob} photo original capture (JPEG), kept to adjust corners later
 * @property {Quad} quad corners used, normalized
 * @property {Blob} image straightened page (JPEG)
 * @property {string} url object URL of `image`, for the thumbnail
 */

export class PageList {
  /**
   * @param {HTMLOListElement} list
   * @param {{ onAdjust: (page: Page) => void, onChange: (count: number) => void }} callbacks
   */
  constructor(list, { onAdjust, onChange }) {
    this.list = list;
    this.onAdjust = onAdjust;
    this.onChange = onChange;
    /** @type {Page[]} */
    this.pages = [];
    this.nextId = 1;
    this.render();
  }

  /**
   * @param {{ photo: Blob, quad: Quad, image: Blob }} data
   * @returns {Page}
   */
  add({ photo, quad, image }) {
    const page = { id: this.nextId++, photo, quad, image, url: URL.createObjectURL(image) };
    this.pages.push(page);
    this.render();
    return page;
  }

  /**
   * Replace the straightened image after a corner adjustment.
   * @param {number} id
   * @param {{ quad: Quad, image: Blob }} data
   */
  update(id, { quad, image }) {
    const page = this.pages.find((p) => p.id === id);
    if (!page) return;
    URL.revokeObjectURL(page.url);
    Object.assign(page, { quad, image, url: URL.createObjectURL(image) });
    this.render();
  }

  /** @param {number} id */
  remove(id) {
    const index = this.pages.findIndex((p) => p.id === id);
    if (index < 0) return;
    URL.revokeObjectURL(this.pages[index].url);
    this.pages.splice(index, 1);
    this.render();
  }

  render() {
    if (this.pages.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = t('pages.empty');
      this.list.replaceChildren(empty);
    } else {
      this.list.replaceChildren(...this.pages.map((page, i) => this.renderPage(page, i + 1)));
    }
    this.onChange(this.pages.length);
  }

  /**
   * @param {Page} page
   * @param {number} number position in the book
   */
  renderPage(page, number) {
    const item = document.createElement('li');
    const img = document.createElement('img');
    img.src = page.url;
    img.alt = t('pages.thumbAlt', { number });
    img.loading = 'lazy';
    const label = document.createElement('span');
    label.textContent = t('pages.label', { number });
    const adjust = document.createElement('button');
    adjust.type = 'button';
    adjust.textContent = t('pages.adjust');
    adjust.addEventListener('click', () => this.onAdjust(page));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = t('pages.remove');
    remove.addEventListener('click', () => this.remove(page.id));
    item.append(img, label, adjust, remove);
    return item;
  }
}
