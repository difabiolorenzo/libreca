/**
 * Available interface languages. To add a language: create `<code>.js`
 * next to `fr.js` (same keys) and register it here.
 *
 * @type {Record<string, { name: string, load: () => Promise<{ default: object }> }>}
 */
export const LANGUAGES = {
  fr: { name: 'Français', load: () => import('./fr.js') },
};

export const DEFAULT_LANGUAGE = 'fr';
