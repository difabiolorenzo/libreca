import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPdf, jpegInfo, pdfDate, pdfString, winAnsiHex } from '../src/export/pdf.js';

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
  assert.equal(entries.length, 10); // catalog, pages, info, 3 per page, XMP
  entries.forEach((pos, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj\n`, pos), `object ${i + 1}`));
});

test('pdfString keeps ASCII literal and writes anything else in UTF-16BE', () => {
  assert.equal(pdfString('Libreca (v0.4)'), '(Libreca \\(v0.4\\))');
  assert.equal(pdfString('Été'), '<FEFF00C9007400E9>');
  assert.equal(pdfString('𝄞'), '<FEFFD834DD1E>'); // surrogate pair kept
});

test('pdfDate is in UTC', () => {
  assert.equal(pdfDate(new Date(Date.UTC(2026, 10, 5, 8, 4, 9))), 'D:20261105080409Z');
});

test('buildPdf declares title, author and language (Info, catalog and XMP)', () => {
  const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
  const bytes = buildPdf([fakeJpeg(100, 150)], { title: 'Les Misérables', author: 'Victor Hugo', lang: 'fr', date });
  const pdf = latin1(bytes);
  assert.match(pdf, /\/Type \/Catalog \/Pages 2 0 R \/Metadata 7 0 R \/Lang \(fr\) \/ViewerPreferences << \/DisplayDocTitle true >>/);
  assert.match(pdf, new RegExp(`/Title ${pdfString('Les Misérables')} /Author \\(Victor Hugo\\)`));
  assert.match(pdf, /\/CreationDate \(D:20260102030405Z\)/);

  const utf8 = new TextDecoder().decode(bytes);
  assert.match(utf8, /<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Les Misérables<\/rdf:li>/);
  assert.match(utf8, /<dc:creator><rdf:Seq><rdf:li>Victor Hugo<\/rdf:li>/);
  assert.match(utf8, /<dc:language><rdf:Bag><rdf:li>fr<\/rdf:li>/);
  assert.match(utf8, /<xmp:CreateDate>2026-01-02T03:04:05Z<\/xmp:CreateDate>/);

  // The XMP stream length matches its bytes.
  const start = pdf.indexOf('7 0 obj\n');
  const length = Number(/\/Length (\d+)/.exec(pdf.slice(start))[1]);
  const body = pdf.indexOf('stream\n', start) + 'stream\n'.length;
  assert.ok(pdf.startsWith('\nendstream', body + length));
});

test('buildPdf leaves out empty metadata and escapes XML', () => {
  const pdf = new TextDecoder().decode(buildPdf([fakeJpeg(10, 10)], { title: 'A & <B>' }));
  assert.doesNotMatch(pdf, /\/Author|\/Lang|dc:creator|dc:language/);
  assert.match(pdf, /A &#38; &#60;B&#62;/);
});

test('buildPdf labels the cover and numbers the next pages from 1', () => {
  const pdf = latin1(buildPdf([fakeJpeg(10, 10), fakeJpeg(10, 10)], { coverLabel: 'Couverture' }));
  assert.match(pdf, /\/PageLabels << \/Nums \[0 << \/P \(Couverture\) >> 1 << \/S \/D >>\] >>/);
  const single = latin1(buildPdf([fakeJpeg(10, 10)], { coverLabel: 'Couverture' }));
  assert.match(single, /\/PageLabels << \/Nums \[0 << \/P \(Couverture\) >>\] >>/);
  assert.doesNotMatch(latin1(buildPdf([fakeJpeg(10, 10)])), /PageLabels/);
});

test('winAnsiHex encodes French text for the standard fonts', () => {
  assert.equal(winAnsiHex('Aé'), '<41E9>');
  assert.equal(winAnsiHex('œ’€«»'), '<9C9280ABBB>');
  assert.equal(winAnsiHex('ﬁn'), '<66696E>'); // ligature split
  assert.equal(winAnsiHex('Ω'), '<3F>'); // not in WinAnsi
});

test('buildPdf with text: invisible words over the image, tagged in reading order', () => {
  const ocr = {
    width: 1000,
    height: 1000,
    paragraphs: [
      [{ size: 40, words: [{ text: 'Il', x0: 100, x1: 140, y: 200 }, { text: 'était', x0: 160, x1: 260, y: 200 }] }],
      [{ size: 40, words: [{ text: 'fin', x0: 100, x1: 160, y: 400 }] }],
    ],
  };
  const pdf = latin1(buildPdf([fakeJpeg(1000, 1000), fakeJpeg(1000, 1000)], { text: [ocr, null], alts: ['Page 1', 'Page 2'] }));

  // Catalog and pages.
  assert.match(pdf, /\/MarkInfo << \/Marked true >> \/StructTreeRoot 12 0 R/);
  assert.match(pdf, /\/Contents 5 0 R \/StructParents 0 \/Tabs \/S >>/);
  assert.match(pdf, /\/Font << \/F1 11 0 R >>/);
  assert.match(pdf, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding \/FirstChar 32 \/LastChar 255 \/Widths \[500 /);

  // Page 1: image as artifact, then one marked paragraph per MCID.
  const content = /5 0 obj\n<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(pdf);
  assert.equal(Number(content[1]), content[2].length);
  assert.match(content[2], /^\/Artifact BMC q 595\.28 0 0 595\.28 0 0 cm \/Im0 Do Q EMC\n\/P << \/MCID 0 >> BDC\nBT\n3 Tr/);
  assert.match(content[2], /\/P << \/MCID 1 >> BDC/);
  // 595.28 pt for 1000 px: scale 0.59528. « Il » + space spans 100 → 160 px = 35.72 pt;
  // 3 glyphs × 0.5 × 23.81 pt = 35.72 pt natural width → Tz 100.
  assert.match(content[2], /\/F1 23\.81 Tf\n100 Tz 1 0 0 1 59\.53 476\.22 Tm <496C20> Tj/);
  assert.match(content[2], /<E974616974> Tj/); // last word of the line: no trailing space

  // Page 2 has no text: the image is a figure with its alternative.
  assert.match(pdf, /\/Figure << \/MCID 0 >> BDC q 595\.28 0 0 595\.28 0 0 cm \/Im0 Do Q EMC/);
  assert.match(pdf, /\/S \/Figure \/P 13 0 R \/Pg 7 0 R \/K 0 \/Alt \(Page 2\)/);

  // Structure: Document → P, P, Figure; parent tree by page and MCID.
  assert.match(pdf, /\/S \/Document \/P 12 0 R \/K \[15 0 R 16 0 R 17 0 R\]/);
  assert.match(pdf, /<< \/Nums \[0 \[15 0 R 16 0 R\] 1 \[17 0 R\]\] >>/);
  assert.match(pdf, /\/S \/P \/P 13 0 R \/Pg 4 0 R \/K 1 >>/);

  // Every object is where the cross-reference table says.
  const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)[1]);
  const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, 17);
  entries.forEach((pos, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj\n`, pos), `object ${i + 1}`));
});

test('buildPdf without text stays untagged', () => {
  assert.doesNotMatch(latin1(buildPdf([fakeJpeg(10, 10)])), /MarkInfo|StructTreeRoot|StructParents|\/F1/);
});

test('buildPdf refuses an empty document', () => {
  assert.throws(() => buildPdf([]), /no page/);
});
