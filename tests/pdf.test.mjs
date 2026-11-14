import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPdf, jpegInfo } from '../src/export/pdf.js';

/**
 * Smallest JPEG-like header the writer needs: SOI, an APP0 segment,
 * SOF0 with the size, EOI. (The PDF writer does not decode the image.)
 * @param {number} width
 * @param {number} height
 * @param {number} [components]
 */
function fakeJpeg(width, height, components = 3) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, 2 bytes of payload
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, components,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xd9,
  ]);
}

const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes);

test('jpegInfo reads the size after other segments', () => {
  assert.deepEqual(jpegInfo(fakeJpeg(1240, 1754)), { width: 1240, height: 1754, components: 3 });
  assert.throws(() => jpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), /not a JPEG/);
});

test('buildPdf writes one page per image with a valid cross-reference table', () => {
  const pdf = latin1(buildPdf([fakeJpeg(1000, 1500), fakeJpeg(800, 600, 1)]));
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.endsWith('%%EOF\n'));
  assert.match(pdf, /\/Type \/Pages \/Kids \[4 0 R 7 0 R\] \/Count 2/);
  assert.match(pdf, /\/MediaBox \[0 0 595\.28 892\.92\]/); // 1000 × 1500 at A4 width
  assert.match(pdf, /\/ColorSpace \/DeviceGray/);

  const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)[1]);
  assert.ok(pdf.startsWith('xref\n', startxref));
  const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, 9); // catalog, pages, info + 3 per page
  entries.forEach((pos, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj\n`, pos), `object ${i + 1}`));
});

test('buildPdf refuses an empty document', () => {
  assert.throws(() => buildPdf([]), /no page/);
});
