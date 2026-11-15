/**
 * StatusChip: a 32px pill naming a state, always icon + text (never the
 * color alone). Markup: `<output class="chip" data-tone="ok">`; add the
 * `chip-overlay` class to lay it on the `scrim` over the camera feed.
 */

import { createIcon } from './icons.js';

/** @typedef {'ok' | 'info' | 'warning' | 'danger'} Tone */

/** @type {Record<Tone, import('./icons.js').IconName>} */
const TONE_ICONS = { ok: 'check', info: 'info', warning: 'warning', danger: 'danger' };

/**
 * @param {HTMLElement} chip
 * @param {Tone} tone
 * @param {string} text
 */
export function setChip(chip, tone, text) {
  chip.dataset.tone = tone;
  const label = document.createElement('span');
  label.textContent = text;
  chip.replaceChildren(createIcon(TONE_ICONS[tone] ?? 'info'), label);
}
