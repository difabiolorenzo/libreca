// Pages of the open book: adding, moving, loading, what gets saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PageList, moveItem, toRecord } from '../src/ui/page-list.js';

const blob = () => new Blob(['x'], { type: 'image/jpeg' });
const data = () => ({
  photo: blob(), quad: [], detected: true, straight: blob(), enhanced: blob(), image: blob(),
  corrections: { dewarp: true, clean: true, crop: true, color: /** @type {const} */ ('color') }, applied: {},
});

test('moveItem moves and clamps', () => {
  const list = [1, 2, 3, 4];
  assert.equal(moveItem(list, 0, 2), true);
  assert.deepEqual(list, [2, 3, 1, 4]);
  assert.equal(moveItem(list, 3, -5), true);
  assert.deepEqual(list, [4, 2, 3, 1]);
  assert.equal(moveItem(list, 1, 1), false);
  assert.equal(moveItem(list, 9, 0), false);
});

test('PageList reports every change and moves pages', () => {
  const changes = [];
  const pages = new PageList((c) => changes.push(c.type));
  const a = pages.add(data());
  const b = pages.add(data());
  const c = pages.add(data(), 0);
  assert.deepEqual(pages.pages.map((p) => p.id), [c.id, a.id, b.id]);
  pages.move(b.id, 0);
  assert.deepEqual(pages.pages.map((p) => p.id), [b.id, c.id, a.id]);
  pages.move(b.id, 0); // no move, no change
  pages.remove(c.id);
  assert.deepEqual(changes, ['add', 'add', 'add', 'move', 'remove']);
});

test('toRecord drops the object URLs; load restores a saved book', () => {
  const pages = new PageList(() => {});
  const page = pages.add(data());
  const record = toRecord(page);
  assert.equal('url' in record, false);
  assert.equal('beforeUrl' in record, false);
  assert.equal(record.id, page.id);

  const other = new PageList(() => {});
  other.load([{ ...record, id: 7 }, { ...record, id: 3 }], 2);
  assert.deepEqual(other.pages.map((p) => p.id), [7, 3]);
  assert.ok(other.pages[0].url.startsWith('blob:'));
  // New ids never reuse a saved one.
  assert.equal(other.add(data()).id, 8);
});
