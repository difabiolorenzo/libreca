/**
 * Saved books, on this device only (IndexedDB). Two stores:
 * - `books`: { id, title, created, updated, nextId, order } where `order`
 *   lists the page ids in reading order;
 * - `pages`: one record per page (its images as Blobs), key [bookId, id].
 * Nothing leaves the device.
 */

/** @typedef {import('../ui/page-list.js').PageRecord} PageRecord */

/**
 * @typedef {object} BookRecord
 * @property {number} id
 * @property {string} title '' until renamed
 * @property {number} created
 * @property {number} updated
 * @property {number} nextId next page id
 * @property {number[]} order page ids in reading order
 */

const DB_NAME = 'libreca';
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase> | null} */
let opening = null;

/** @returns {Promise<IDBDatabase>} */
function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('pages', { keyPath: ['bookId', 'id'] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  opening.catch(() => { opening = null; });
  return opening;
}

/** @param {IDBRequest | IDBTransaction} target */
function done(target) {
  return new Promise((resolve, reject) => {
    if (target instanceof IDBTransaction) {
      target.oncomplete = () => resolve(undefined);
      target.onerror = () => reject(target.error);
      target.onabort = () => reject(target.error);
    } else {
      target.onsuccess = () => resolve(target.result);
      target.onerror = () => reject(target.error);
    }
  });
}

/**
 * @param {'books' | 'pages' | ('books' | 'pages')[]} stores
 * @param {IDBTransactionMode} mode
 */
async function tx(stores, mode) {
  return (await open()).transaction(stores, mode);
}

/** All pages of a book, keyed range [bookId, -∞..+∞]. */
const bookRange = (/** @type {number} */ bookId) => IDBKeyRange.bound([bookId, -Infinity], [bookId, Infinity]);

/** @returns {Promise<BookRecord[]>} most recently changed first */
export async function listBooks() {
  const t = await tx('books', 'readonly');
  /** @type {BookRecord[]} */
  const books = await done(t.objectStore('books').getAll());
  return books.sort((a, b) => b.updated - a.updated);
}

/**
 * @param {number} id
 * @returns {Promise<BookRecord | undefined>}
 */
export async function getBook(id) {
  const t = await tx('books', 'readonly');
  return done(t.objectStore('books').get(id));
}

/** @returns {Promise<BookRecord>} a new empty book */
export async function createBook() {
  const now = Date.now();
  /** @type {Omit<BookRecord, 'id'>} */
  const book = { title: '', created: now, updated: now, nextId: 1, order: [] };
  const t = await tx('books', 'readwrite');
  const id = /** @type {number} */ (await done(t.objectStore('books').add(book)));
  return { ...book, id };
}

/** @param {BookRecord} book */
export async function saveBook(book) {
  const t = await tx('books', 'readwrite');
  t.objectStore('books').put(book);
  await done(t);
}

/** @param {number} id the book and all its pages */
export async function deleteBook(id) {
  const t = await tx(['books', 'pages'], 'readwrite');
  t.objectStore('books').delete(id);
  t.objectStore('pages').delete(bookRange(id));
  await done(t);
}

/**
 * Pages of a book, in reading order.
 * @param {BookRecord} book
 * @returns {Promise<PageRecord[]>}
 */
export async function loadPages(book) {
  const t = await tx('pages', 'readonly');
  /** @type {(PageRecord & { bookId: number })[]} */
  const records = await done(t.objectStore('pages').getAll(bookRange(book.id)));
  const byId = new Map(records.map(({ bookId, ...page }) => [page.id, page]));
  return book.order.map((id) => byId.get(id)).filter((p) => p !== undefined);
}

/**
 * First page image of a book (its cover), if any.
 * @param {BookRecord} book
 * @returns {Promise<Blob | null>}
 */
export async function coverOf(book) {
  if (!book.order.length) return null;
  const t = await tx('pages', 'readonly');
  const page = await done(t.objectStore('pages').get([book.id, book.order[0]]));
  return page?.image ?? null;
}

/**
 * @param {number} bookId
 * @param {PageRecord} page
 */
export async function savePage(bookId, page) {
  const t = await tx('pages', 'readwrite');
  t.objectStore('pages').put({ ...page, bookId });
  await done(t);
}

/**
 * @param {number} bookId
 * @param {number} id
 */
export async function deletePage(bookId, id) {
  const t = await tx('pages', 'readwrite');
  t.objectStore('pages').delete([bookId, id]);
  await done(t);
}

/** Ask the browser not to clear the saved books under storage pressure. */
export function persistStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
