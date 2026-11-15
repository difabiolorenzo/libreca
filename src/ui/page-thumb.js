/**
 * PageThumb: thumbnail of a captured page, as a button whose accessible name
 * gives the page number and its state (« Page 24, corrigée »).
 */

import { t } from '../i18n/i18n.js';

/**
 * @param {{ url: string, number: number, retake?: boolean, current?: boolean, cover?: boolean }} options
 *   retake: page to take again (shown with a dashed warning outline and a note)
 *   current: page in progress (accent outline, aria-current)
 *   cover: the book's cover photo (« Couverture » instead of the page number)
 * @returns {HTMLButtonElement}
 */
export function createPageThumb({ url, number, retake = false, current = false, cover = false }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'page-thumb';
  button.classList.toggle('is-retake', retake);
  if (current) button.setAttribute('aria-current', 'true');
  const state = t(retake ? 'pages.state.retake' : 'pages.state.done');
  button.setAttribute('aria-label', t(cover ? 'pages.coverName' : 'pages.thumbName', { number, state }));

  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.loading = 'lazy';
  img.draggable = false;

  const caption = document.createElement('span');
  caption.textContent = cover ? t('pages.cover') : t('pages.caption', { number });
  button.append(img, caption);

  if (retake) {
    const note = document.createElement('span');
    note.className = 'thumb-note';
    note.textContent = t('pages.retakeNote');
    button.append(note);
  }
  return button;
}
