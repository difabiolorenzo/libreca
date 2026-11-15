/**
 * Text recognition (OCR) with Tesseract.js, served locally from
 * src/vendor/tesseract/ (never from a CDN: every path is given). Tesseract
 * runs in its own Web Worker, so the interface stays fluid. Loaded only
 * when the « Texte sélectionnable » export option is used.
 *
 * The result of a page is reduced to what the PDF text layer needs: words,
 * their horizontal extent and baseline, grouped in lines and paragraphs
 * (paragraphs give the reading order of the tagged PDF).
 */

const VENDOR = new URL('../vendor/tesseract/', import.meta.url);

/** Interface language → Tesseract model shipped in vendor/tesseract/lang/. */
export const OCR_LANGUAGES = /** @type {Record<string, string>} */ ({ fr: 'fra' });

/** Tesseract engine: LSTM only (the most accurate, the only one shipped). */
const OEM_LSTM_ONLY = 1;

/**
 * @typedef {object} OcrWord
 * @property {string} text
 * @property {number} x0 left edge, in image pixels
 * @property {number} x1 right edge, in image pixels
 * @property {number} y baseline under the word, in image pixels (from the top)
 */

/**
 * @typedef {object} OcrLine
 * @property {OcrWord[]} words
 * @property {number} size font size in image pixels (height of the text row)
 */

/**
 * @typedef {object} OcrPage
 * @property {number} width image width in pixels
 * @property {number} height image height in pixels
 * @property {OcrLine[][]} paragraphs in reading order
 */

/**
 * The browser runs WebAssembly SIMD (smallest SIMD module, as in
 * wasm-feature-detect).
 * @returns {boolean}
 */
export function simdSupported() {
  try {
    return WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]));
  } catch {
    return false;
  }
}

/**
 * Tesseract blocks (output `blocks`) → OcrPage. Empty words and lines are
 * dropped; the baseline under each word follows the (possibly slanted)
 * baseline of its line.
 * @param {any[] | null} blocks Tesseract's data.blocks
 * @param {number} width
 * @param {number} height
 * @returns {OcrPage}
 */
export function toOcrPage(blocks, width, height) {
  /** @type {OcrLine[][]} */
  const paragraphs = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      /** @type {OcrLine[]} */
      const lines = [];
      for (const line of paragraph.lines ?? []) {
        const { x0: bx0, y0: by0, x1: bx1, y1: by1 } = line.baseline ?? {};
        const slope = Number.isFinite(by0) && bx1 !== bx0 ? (by1 - by0) / (bx1 - bx0) : 0;
        /** @param {number} x */
        const baselineAt = (x) => (Number.isFinite(by0) ? by0 + slope * (x - bx0) : line.bbox.y1);
        const words = (line.words ?? [])
          .map((/** @type {any} */ w) => ({ text: String(w.text ?? '').trim(), x0: w.bbox.x0, x1: w.bbox.x1, y: 0 }))
          .filter((w) => w.text && w.x1 > w.x0)
          .map((w) => ({ ...w, y: baselineAt((w.x0 + w.x1) / 2) }));
        if (!words.length) continue;
        const rowHeight = line.rowAttributes?.rowHeight;
        const size = rowHeight > 0 ? rowHeight : line.bbox.y1 - line.bbox.y0;
        lines.push({ words, size: Math.max(1, size) });
      }
      if (lines.length) paragraphs.push(lines);
    }
  }
  return { width, height, paragraphs };
}

/**
 * One Tesseract worker for a series of pages; results kept per image (a
 * page whose image did not change is not read again during the session).
 */
export class Ocr {
  /** @type {WeakMap<Blob, OcrPage>} */
  static #done = new WeakMap();

  /** @param {string} language interface language code, e.g. 'fr' */
  constructor(language) {
    this.lang = OCR_LANGUAGES[language] ?? OCR_LANGUAGES.fr;
    /** @type {Promise<any> | null} */
    this.worker = null;
  }

  /** @param {string} language */
  static supports(language) {
    return language in OCR_LANGUAGES;
  }

  async #start() {
    const { default: Tesseract } = await import(new URL('tesseract.esm.min.js', VENDOR).href);
    const core = simdSupported() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
    return Tesseract.createWorker(this.lang, OEM_LSTM_ONLY, {
      workerPath: new URL('worker.min.js', VENDOR).href,
      corePath: new URL(`core/${core}`, VENDOR).href,
      langPath: new URL('lang', VENDOR).href,
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none', // the service worker already keeps the files for offline use
    });
  }

  /**
   * Read the text of a page image.
   * @param {Blob} image JPEG of the page, as exported
   * @param {number} width
   * @param {number} height
   * @returns {Promise<OcrPage>}
   */
  async recognize(image, width, height) {
    const known = Ocr.#done.get(image);
    if (known) return known;
    this.worker ??= this.#start();
    const worker = await this.worker;
    const { data } = await worker.recognize(image, {}, { text: false, blocks: true });
    const page = toOcrPage(data.blocks, width, height);
    Ocr.#done.set(image, page);
    return page;
  }

  async close() {
    const worker = this.worker;
    this.worker = null;
    if (worker) await (await worker).terminate();
  }
}
