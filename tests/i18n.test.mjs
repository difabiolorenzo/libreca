// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { t, setLanguage, matchLanguage, LANGUAGES } from '../src/i18n/i18n.js';
import fr from '../src/i18n/locales/fr.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Flatten a nested dictionary into dotted keys. */
function flatKeys(dict, prefix = '') {
  return Object.entries(dict).flatMap(([k, v]) =>
    typeof v === 'object' ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

async function listJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.js') && !e.parentPath.includes('vendor'))
    .map((e) => join(e.parentPath, e.name));
}

const frKeys = new Set(flatKeys(fr));

test('every key used in index.html exists in French', async () => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 0);
  for (const key of used) assert.ok(frKeys.has(key), `missing key: ${key}`);
});

test('every key used in JavaScript exists in French', async () => {
  const namespaces = Object.keys(fr).join('|');
  const pattern = new RegExp(`'((?:${namespaces})\\.[\\w.]+)'`, 'g');
  for (const file of await listJs(join(ROOT, 'src'))) {
    const code = await readFile(file, 'utf8');
    for (const [, key] of code.matchAll(pattern)) {
      assert.ok(frKeys.has(key), `missing key ${key} in ${file}`);
    }
  }
});

test('every language has exactly the French keys', async () => {
  for (const [code, { load }] of Object.entries(LANGUAGES)) {
    const keys = new Set(flatKeys((await load()).default));
    assert.deepEqual([...keys].sort(), [...frKeys].sort(), `language ${code}`);
  }
});

test('t() translates, interpolates and falls back to the key', async () => {
  await setLanguage('fr');
  assert.equal(t('settings.language'), 'Langue');
  assert.equal(t('camera.running', { width: 1920, height: 1080 }), 'Caméra active : 1920 × 1080');
  assert.equal(t('camera.unnamed'), 'Caméra {index}');
  assert.equal(t('does.not.exist'), 'does.not.exist');
});

test('matchLanguage() picks a supported language or French', () => {
  assert.equal(matchLanguage(['fr-CA', 'en']), 'fr');
  assert.equal(matchLanguage(['xx']), 'fr');
  assert.equal(matchLanguage([]), 'fr');
});
