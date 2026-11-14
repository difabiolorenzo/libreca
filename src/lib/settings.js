/**
 * Tiny persistent settings store (localStorage). Storage can be missing or
 * throw (private mode, file://), so every access is guarded.
 */

const PREFIX = 'libreca.';

/**
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function getSetting(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function setSetting(key, value) {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Settings are a convenience: ignore storage failures.
  }
}
