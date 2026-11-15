import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitText, wrapText } from '../src/export/cover.js';

/** Monospace measure: every character is `size` × 0.5 wide. */
const mono = (text, size = 10) => text.length * size * 0.5;

test('wrapText breaks at spaces without exceeding the width', () => {
  // 5 px per character: « tome premier » is exactly 60 px wide.
  assert.deepEqual(wrapText('Les Misérables tome premier', 60, (s) => mono(s)), ['Les', 'Misérables', 'tome premier']);
  assert.deepEqual(wrapText('Les Misérables tome premier', 100, (s) => mono(s)), ['Les Misérables tome', 'premier']);
  assert.deepEqual(wrapText('  Un   titre  ', 1000, (s) => mono(s)), ['Un titre']);
  assert.deepEqual(wrapText('', 100, (s) => mono(s)), []);
});

test('wrapText leaves a word too long alone on its line', () => {
  assert.deepEqual(wrapText('Anticonstitutionnellement court', 50, (s) => mono(s)), ['Anticonstitutionnellement', 'court']);
});

test('fitText keeps the largest size that fits the lines', () => {
  const box = { maxWidth: 200, maxLines: 2, max: 40, min: 10 };
  const short = fitText('Germinal', box, mono);
  assert.equal(short.size, 40); // 8 × 20 = 160 ≤ 200
  assert.deepEqual(short.lines, ['Germinal']);

  const long = fitText('À la recherche du temps perdu', box, mono);
  assert.ok(long.size < 40 && long.size >= 10);
  assert.ok(long.lines.length <= 2);
  assert.ok(long.lines.every((l) => mono(l, long.size) <= 200));
});

test('fitText falls back to the smallest size when nothing fits', () => {
  const block = fitText('Anticonstitutionnellement', { maxWidth: 20, maxLines: 1, max: 40, min: 10 }, mono);
  assert.equal(block.size, 10);
  assert.deepEqual(block.lines, ['Anticonstitutionnellement']);
});
