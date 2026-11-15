/**
 * Minimal PDF writer: one JPEG image per page, embedded as is (DCTDecode,
 * no re-encoding); no dependency. Document metadata (title, author,
 * language) goes both in the Info dictionary and in XMP, so that readers
 * and accessibility checkers show the title instead of the file name.
 */

/**
 * @typedef {object} JpegInfo
 * @property {number} width
 * @property {number} height
 * @property {number} components 1 (gray), 3 (colour) or 4 (CMYK)
 */

/**
 * Read size and colour components from a JPEG header (SOF marker).
 * @param {Uint8Array} bytes
 * @returns {JpegInfo}
 */
export function jpegInfo(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG file');
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        components: bytes[i + 9],
      };
    }
    i += 2 + length;
  }
  throw new Error('JPEG size not found');
}

const COLOR_SPACES = { 1: '/DeviceGray', 3: '/DeviceRGB', 4: '/DeviceCMYK' };

/** @param {number} n */
const num = (n) => String(Math.round(n * 100) / 100);

/**
 * PDF text string: literal when it is printable ASCII, else UTF-16BE with a
 * byte order mark (hex string), so accents and any script survive.
 * @param {string} text
 */
export function pdfString(text) {
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/[()\\]/g, '\\$&')})`;
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * PDF date in UTC: D:YYYYMMDDHHmmSSZ.
 * @param {Date} date
 */
export function pdfDate(date) {
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** @param {string} text */
const xml = (text) => text.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * XMP metadata packet (Dublin Core title, creator and language).
 * @param {{ title: string, author: string, lang: string, producer: string, date: Date }} meta
 */
function xmpPacket({ title, author, lang, producer, date }) {
  const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"'
      + ' xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">',
    '<dc:format>application/pdf</dc:format>',
  ];
  if (title) lines.push(`<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(title)}</rdf:li></rdf:Alt></dc:title>`);
  if (author) lines.push(`<dc:creator><rdf:Seq><rdf:li>${xml(author)}</rdf:li></rdf:Seq></dc:creator>`);
  if (lang) lines.push(`<dc:language><rdf:Bag><rdf:li>${xml(lang)}</rdf:li></rdf:Bag></dc:language>`);
  lines.push(
    `<xmp:CreateDate>${iso}</xmp:CreateDate>`,
    `<xmp:CreatorTool>${xml(producer)}</xmp:CreatorTool>`,
    `<pdf:Producer>${xml(producer)}</pdf:Producer>`,
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  );
  return lines.join('\n');
}

/** @typedef {import('./ocr.js').OcrPage} OcrPage */

/** WinAnsiEncoding bytes 0x80–0x9F (the rest of 0x20–0xFF is Latin-1). */
const WIN_ANSI_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

/**
 * Text in WinAnsiEncoding (the encoding of the standard PDF fonts), as a
 * PDF hex string. Ligatures are split; characters it cannot hold become '?'.
 * @param {string} text
 */
export function winAnsiHex(text) {
  let hex = '';
  for (const char of text.replace(/[ﬀ-ﬆ]/g, (c) => c.normalize('NFKC'))) {
    const code = char.codePointAt(0) ?? 63;
    let byte = 63; // '?'
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) byte = code;
    else if (WIN_ANSI_HIGH.includes(char) && !/[\u0081\u008d\u008f\u0090\u009d]/.test(char)) byte = 0x80 + WIN_ANSI_HIGH.indexOf(char);
    hex += byte.toString(16).padStart(2, '0').toUpperCase();
  }
  return `<${hex}>`;
}

/** Glyph width of the text-layer font, in 1/1000 of the font size. */
const GLYPH_WIDTH = 500;

/**
 * Invisible text of one page (rendering mode 3: neither filled nor
 * stroked), placed over the words of the image so that it can be selected,
 * searched and read aloud. Each word is stretched (Tz) to cover the word
 * and the gap to the next one, which keeps a space between words.
 * @param {import('./ocr.js').OcrLine[]} lines
 * @param {number} scale points per image pixel
 * @param {number} pageHeight in points
 */
function textLayer(lines, scale, pageHeight) {
  const ops = ['BT', '3 Tr'];
  for (const { words, size } of lines) {
    const fontSize = size * scale;
    ops.push(`/F1 ${num(fontSize)} Tf`);
    words.forEach((word, i) => {
      const next = words[i + 1];
      const text = next ? `${word.text} ` : word.text;
      const span = ((next ? Math.max(word.x1, next.x0) : word.x1) - word.x0) * scale;
      const natural = [...text].length * (GLYPH_WIDTH / 1000) * fontSize;
      ops.push(`${num((100 * span) / natural)} Tz 1 0 0 1 ${num(word.x0 * scale)} ${num(pageHeight - word.y * scale)} Tm ${winAnsiHex(text)} Tj`);
    });
  }
  ops.push('ET');
  return ops.join('\n');
}

/**
 * @typedef {object} PdfOptions
 * @property {number} [pageWidth] page width in points (1/72 inch); height follows the image ratio
 * @property {string} [producer]
 * @property {string} [title] document title, shown by readers instead of the file name
 * @property {string} [author]
 * @property {string} [lang] language of the document (BCP 47, e.g. 'fr')
 * @property {Date} [date] creation date (now by default)
 * @property {string} [coverLabel] the first page is the cover: readers show this label for it
 *   and number the next pages from 1
 * @property {(OcrPage | null)[]} [text] recognized text of each page (null: none). When given,
 *   the PDF is tagged: invisible selectable text over each page, paragraphs in reading order,
 *   and the page image as decoration (or as a figure, on a page without text)
 * @property {string[]} [alts] text alternative of each page image shown as a figure (tagged PDF)
 */

/**
 * Build a PDF with one page per JPEG.
 * @param {Uint8Array[]} jpegs
 * @param {PdfOptions} [options]
 * @returns {Uint8Array}
 */
export function buildPdf(jpegs, {
  pageWidth = 595.28, producer = 'Libreca', title = '', author = '', lang = '', date = new Date(), coverLabel = '',
  text = undefined, alts = [],
} = {}) {
  if (jpegs.length === 0) throw new Error('no page');
  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let offset = 0;
  /** @type {number[]} */
  const offsets = []; // offsets[n] = byte position of object n
  /** @param {string | Uint8Array} data */
  const write = (data) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };
  /** @param {number} n @param {string} body */
  const object = (n, body) => {
    offsets[n] = offset;
    write(`${n} 0 obj\n${body}\nendobj\n`);
  };

  // Object numbers: 1 catalog, 2 page tree, 3 info, then 3 per page, then
  // the XMP metadata stream; for a tagged PDF, then the text font, the
  // structure tree root, its Document element, the parent tree and one
  // element per paragraph (or figure).
  /** @param {number} i */
  const pageObj = (i) => 4 + i * 3;
  const metadataObj = pageObj(jpegs.length);
  const tagged = Array.isArray(text);
  const fontObj = metadataObj + 1;
  const structRootObj = metadataObj + 2;
  const documentObj = metadataObj + 3;
  const parentTreeObj = metadataObj + 4;
  /** @type {{ obj: number, page: number, mcid: number, figure: boolean }[]} */
  const elements = [];
  /** @type {number[][]} element objects of each page, by MCID */
  const pageElements = jpegs.map(() => []);
  if (tagged) {
    jpegs.forEach((_, i) => {
      const count = text[i]?.paragraphs.length ?? 0;
      for (let mcid = 0; mcid < Math.max(1, count); mcid++) {
        const obj = parentTreeObj + 1 + elements.length;
        elements.push({ obj, page: i, mcid, figure: count === 0 });
        pageElements[i].push(obj);
      }
    });
  }

  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // "binary file" marker
  const catalog = ['/Type /Catalog', '/Pages 2 0 R', `/Metadata ${metadataObj} 0 R`];
  if (tagged) catalog.push('/MarkInfo << /Marked true >>', `/StructTreeRoot ${structRootObj} 0 R`);
  if (lang) catalog.push(`/Lang ${pdfString(lang)}`);
  if (title) catalog.push('/ViewerPreferences << /DisplayDocTitle true >>');
  if (coverLabel) {
    const rest = jpegs.length > 1 ? ' 1 << /S /D >>' : '';
    catalog.push(`/PageLabels << /Nums [0 << /P ${pdfString(coverLabel)} >>${rest}] >>`);
  }
  object(1, `<< ${catalog.join(' ')} >>`);
  const kids = jpegs.map((_, i) => `${pageObj(i)} 0 R`).join(' ');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${jpegs.length} >>`);
  const info = [];
  if (title) info.push(`/Title ${pdfString(title)}`);
  if (author) info.push(`/Author ${pdfString(author)}`);
  info.push(`/Creator ${pdfString(producer)}`, `/Producer ${pdfString(producer)}`, `/CreationDate ${pdfString(pdfDate(date))}`);
  object(3, `<< ${info.join(' ')} >>`);

  jpegs.forEach((jpeg, i) => {
    const { width, height, components } = jpegInfo(jpeg);
    const colorSpace = COLOR_SPACES[/** @type {1 | 3 | 4} */ (components)];
    if (!colorSpace) throw new Error(`unsupported JPEG (${components} components)`);
    const w = pageWidth;
    const h = (pageWidth * height) / width;
    const n = pageObj(i);
    const page = tagged ? text[i] : null;
    const font = page ? ` /Font << /F1 ${fontObj} 0 R >>` : '';
    const structure = tagged ? ` /StructParents ${i} /Tabs /S` : '';
    object(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] `
      + `/Resources << /XObject << /Im0 ${n + 2} 0 R >>${font} >> /Contents ${n + 1} 0 R${structure} >>`);
    const paint = `q ${num(w)} 0 0 ${num(h)} 0 0 cm /Im0 Do Q`;
    let content = paint;
    if (tagged && page?.paragraphs.length) {
      // The image is decoration: its words are in the text layer.
      const scale = w / page.width;
      content = [`/Artifact BMC ${paint} EMC`, ...page.paragraphs.map((lines, mcid) =>
        `/P << /MCID ${mcid} >> BDC\n${textLayer(lines, scale, h)}\nEMC`)].join('\n');
    } else if (tagged) {
      content = `/Figure << /MCID 0 >> BDC ${paint} EMC`;
    }
    object(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[n + 2] = offset;
    write(`${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} `
      + `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    write(jpeg);
    write('\nendstream\nendobj\n');
  });

  const packet = encoder.encode(xmpPacket({ title, author, lang, producer, date }));
  offsets[metadataObj] = offset;
  write(`${metadataObj} 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${packet.length} >>\nstream\n`);
  write(packet);
  write('\nendstream\nendobj\n');

  if (tagged) {
    // Text-layer font: standard Helvetica, every glyph 500 units wide, so the
    // width of a word is known without font metrics (the text is invisible).
    const widths = new Array(224).fill(GLYPH_WIDTH).join(' ');
    object(fontObj, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding `
      + `/FirstChar 32 /LastChar 255 /Widths [${widths}] >>`);
    object(structRootObj, `<< /Type /StructTreeRoot /K ${documentObj} 0 R /ParentTree ${parentTreeObj} 0 R `
      + `/ParentTreeNextKey ${jpegs.length} >>`);
    object(documentObj, `<< /Type /StructElem /S /Document /P ${structRootObj} 0 R `
      + `/K [${elements.map((e) => `${e.obj} 0 R`).join(' ')}] >>`);
    const nums = pageElements.map((objs, i) => `${i} [${objs.map((o) => `${o} 0 R`).join(' ')}]`).join(' ');
    object(parentTreeObj, `<< /Nums [${nums}] >>`);
    for (const { obj, page, mcid, figure } of elements) {
      const alt = figure ? ` /Alt ${pdfString(alts[page] ?? '')}` : '';
      object(obj, `<< /Type /StructElem /S /${figure ? 'Figure' : 'P'} /P ${documentObj} 0 R `
        + `/Pg ${pageObj(page)} 0 R /K ${mcid}${alt} >>`);
    }
  }

  const size = offsets.length;
  const xref = offset;
  const lines = ['xref', `0 ${size}`, '0000000000 65535 f '];
  for (let n = 1; n < size; n++) lines.push(`${String(offsets[n]).padStart(10, '0')} 00000 n `);
  write(`${lines.join('\n')}\ntrailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of chunks) { out.set(chunk, pos); pos += chunk.length; }
  return out;
}
