/**
 * Interface theme: follow the system (default), or force Papier (light) or
 * Nuit (dark). Applied as `data-theme` on <html>, read by tokens.css.
 */

import { getSetting, setSetting } from './settings.js';

/** @typedef {'system' | 'light' | 'dark'} Theme */

/** @type {readonly Theme[]} */
export const THEMES = ['system', 'light', 'dark'];

/** @returns {Theme} */
export function getTheme() {
  const theme = getSetting('theme', 'system');
  return THEMES.includes(theme) ? theme : 'system';
}

/**
 * Apply a theme to the page and keep the browser bar color in sync.
 * @param {Theme} theme
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
}

/** @param {Theme} theme */
export function setTheme(theme) {
  setSetting('theme', theme);
  applyTheme(theme);
}

/** Update the browser bar color when the system theme changes. */
export function watchSystemTheme() {
  globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener('change', () => applyTheme(getTheme()));
}
