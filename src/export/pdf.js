/**
 * Minimal PDF writer: one JPEG image per page, embedded as is (DCTDecode,
 * no re-encoding). Enough for v0.1; no dependency.
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
 * @typedef {object} PdfOptions
 * @property {number} [pageWidth] page width in points (1/72 inch); height follows the image ratio
 * @property {string} [producer]
 */

/**
 * Build a PDF with one page per JPEG.
 * @param {Uint8Array[]} jpegs
 * @param {PdfOptions} [options]
 * @returns {Uint8Array}
 */
export function buildPdf(jpegs, { pageWidth = 595.28, producer = 'Libreca' } = {}) {
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

  // Object numbers: 1 catalog, 2 page tree, 3 info, then 3 per page.
  /** @param {number} i */
  const pageObj = (i) => 4 + i * 3;
  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // "binary file" marker
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = jpegs.map((_, i) => `${pageObj(i)} 0 R`).join(' ');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${jpegs.length} >>`);
  object(3, `<< /Producer (${producer.replace(/[()\\]/g, '')}) >>`);

  jpegs.forEach((jpeg, i) => {
    const { width, height, components } = jpegInfo(jpeg);
    const colorSpace = COLOR_SPACES[/** @type {1 | 3 | 4} */ (components)];
    if (!colorSpace) throw new Error(`unsupported JPEG (${components} components)`);
    const w = pageWidth;
    const h = (pageWidth * height) / width;
    const n = pageObj(i);
    object(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] `
      + `/Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    const content = `q ${num(w)} 0 0 ${num(h)} 0 0 cm /Im0 Do Q`;
    object(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[n + 2] = offset;
    write(`${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} `
      + `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    write(jpeg);
    write('\nendstream\nendobj\n');
  });

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
