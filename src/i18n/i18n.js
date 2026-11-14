/**
 * Translation system. No text is hard-coded in the UI: everything goes
 * through keys looked up in the current dictionary, then in French
 * (the reference), then the key itself is shown.
 *
 * In HTML: `data-i18n="key"` sets textContent,
 * `data-i18n-attr="aria-label:key;title:other.key"` sets attributes.
 */

import { LANGUAGES, DEFAULT_LANGUAGE } from './locales/index.js';
import reference from './locales/fr.js';

/** @type {object} */
let current = reference;
let currentCode = DEFAULT_LANGUAGE;

/** Fires `change` after the language changed. */
export const i18nEvents = new EventTarget();

/**
 * @param {object} dict
 * @param {string} key dotted path, e.g. "camera.start"
 * @returns {string | undefined}
 */
function lookup(dict, key) {
  /** @type {any} */
  let node = dict;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Translate a key, replacing `{name}` placeholders with `params.name`.
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const text = lookup(current, key) ?? lookup(reference, key) ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match);
}

/** @returns {string} */
export function getLanguage() {
  return currentCode;
}

/**
 * Pick the best supported language from a list of BCP-47 tags.
 * @param {readonly string[]} preferred e.g. navigator.languages
 * @returns {string}
 */
export function matchLanguage(preferred) {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base in LANGUAGES) return base;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Load and activate a language, then translate the document if any.
 * @param {string} code
 */
export async function setLanguage(code) {
  const entry = LANGUAGES[code] ?? LANGUAGES[DEFAULT_LANGUAGE];
  const resolved = code in LANGUAGES ? code : DEFAULT_LANGUAGE;
  current = (await entry.load()).default;
  currentCode = resolved;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = resolved;
    applyTranslations(document);
  }
  i18nEvents.dispatchEvent(new Event('change'));
}

/**
 * Translate every element carrying data-i18n / data-i18n-attr under root.
 * @param {ParentNode} root
 */
export function applyTranslations(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(/** @type {HTMLElement} */ (el).dataset.i18n ?? '');
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    const spec = /** @type {HTMLElement} */ (el).dataset.i18nAttr ?? '';
    for (const pair of spec.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

export { LANGUAGES };
