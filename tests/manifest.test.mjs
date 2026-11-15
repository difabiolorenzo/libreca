import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));

/** @param {Buffer} png */
const pngSize = (png) => `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;

test('index.html links the manifest and the app icons', () => {
  const html = read('index.html').toString();
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="src\/assets\/apple-touch-icon.png">/);
  assert.ok(pngSize(read('src/assets/apple-touch-icon.png')) === '180x180');
});

test('the manifest makes an installable, local app', () => {
  const manifest = JSON.parse(read('manifest.webmanifest').toString());
  assert.equal(manifest.name, 'Libreca');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.lang, 'fr');
  // Same colour as the Papier background (tokens.css) and the theme-color meta.
  assert.match(read('src/styles/tokens.css').toString(), new RegExp(`--bg: ${manifest.background_color};`));
  assert.match(read('index.html').toString(), new RegExp(`<meta name="theme-color" content="${manifest.theme_color}">`));

  for (const icon of manifest.icons) {
    assert.ok(!/^[a-z]+:/i.test(icon.src), `${icon.src} is served locally`);
    assert.ok(existsSync(new URL(icon.src, root)), `${icon.src} exists`);
    if (icon.type === 'image/png') {
      const png = read(icon.src);
      assert.equal(png.subarray(1, 4).toString(), 'PNG', icon.src);
      assert.equal(pngSize(png), icon.sizes, icon.src);
    }
  }
  const purposes = manifest.icons.map((i) => `${i.sizes} ${i.purpose}`);
  assert.ok(purposes.includes('192x192 any') && purposes.includes('512x512 any') && purposes.includes('512x512 maskable'));
});
