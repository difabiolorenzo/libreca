import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toOcrPage, simdSupported, OCR_LANGUAGES } from '../src/export/ocr.js';

const word = (text, x0, x1, y0 = 100, y1 = 130) => ({ text, bbox: { x0, y0, x1, y1 } });

test('toOcrPage keeps paragraphs, lines and words in reading order', () => {
  const blocks = [{
    paragraphs: [
      { lines: [{ words: [word('Il', 10, 30), word('était', 40, 110)], baseline: { x0: 10, y0: 125, x1: 110, y1: 125 }, rowAttributes: { rowHeight: 32 }, bbox: { x0: 10, y0: 100, x1: 110, y1: 130 } }] },
      { lines: [{ words: [word('une', 10, 60, 200, 230)], baseline: { x0: 10, y0: 225, x1: 60, y1: 225 }, rowAttributes: { rowHeight: 0 }, bbox: { x0: 10, y0: 200, x1: 60, y1: 230 } }] },
    ],
  }];
  const page = toOcrPage(blocks, 800, 1200);
  assert.equal(page.width, 800);
  assert.equal(page.height, 1200);
  assert.equal(page.paragraphs.length, 2);
  assert.deepEqual(page.paragraphs[0][0], {
    size: 32,
    words: [{ text: 'Il', x0: 10, x1: 30, y: 125 }, { text: 'était', x0: 40, x1: 110, y: 125 }],
  });
  assert.equal(page.paragraphs[1][0].size, 30); // no row height: the line box
});

test('toOcrPage follows a slanted baseline and drops empty words', () => {
  const blocks = [{
    paragraphs: [{
      lines: [
        { words: [word('a', 0, 20), word('  ', 30, 40), word('b', 80, 100)], baseline: { x0: 0, y0: 100, x1: 100, y1: 110 }, bbox: { x0: 0, y0: 80, x1: 100, y1: 112 } },
        { words: [word(' ', 0, 10)], baseline: { x0: 0, y0: 200, x1: 10, y1: 200 }, bbox: { x0: 0, y0: 190, x1: 10, y1: 202 } },
      ],
    }],
  }];
  const [[line]] = toOcrPage(blocks, 100, 300).paragraphs;
  assert.deepEqual(line.words.map((w) => [w.text, w.y]), [['a', 101], ['b', 109]]);
  assert.equal(toOcrPage(null, 1, 1).paragraphs.length, 0);
});

test('OCR models exist for the interface languages', () => {
  assert.equal(OCR_LANGUAGES.fr, 'fra');
  assert.equal(typeof simdSupported(), 'boolean');
});
