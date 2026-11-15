/**
 * Screens of the single page, one `<section class="screen" data-screen>` each,
 * driven by the address hash (`#/capture`, `#/page/3`…) so the browser and
 * Android back buttons work.
 */

/**
 * @typedef {object} ScreenHooks
 * @property {(param: string) => boolean | void} [enter] called when shown;
 *   returning false sends back to the home screen (e.g. unknown page)
 * @property {() => void} [leave] called when hidden
 */

export class Screens {
  /**
   * @param {ParentNode} root
   * @param {Record<string, ScreenHooks>} hooks per screen name
   * @param {string} home screen shown for an empty or unknown hash
   */
  constructor(root, hooks, home) {
    /** @type {Map<string, HTMLElement>} */
    this.screens = new Map([...root.querySelectorAll('section[data-screen]')]
      .map((el) => [/** @type {HTMLElement} */ (el).dataset.screen ?? '', /** @type {HTMLElement} */ (el)]));
    for (const screen of this.screens.values()) screen.hidden = true;
    this.hooks = hooks;
    this.home = home;
    this.current = '';
    globalThis.addEventListener('hashchange', () => this.route());
  }

  /** Show the screen named by the current hash. */
  route() {
    const [name = '', param = ''] = location.hash.replace(/^#\/?/, '').split('/');
    const target = this.screens.has(name) ? name : this.home;
    if (this.current && this.current !== target) {
      this.hooks[this.current]?.leave?.();
      /** @type {HTMLElement} */ (this.screens.get(this.current)).hidden = true;
    }
    if (this.hooks[target]?.enter?.(param) === false) {
      this.current = '';
      this.go('');
      return;
    }
    const screen = /** @type {HTMLElement} */ (this.screens.get(target));
    screen.hidden = false;
    document.body.dataset.screen = target;
    const first = this.current === '';
    this.current = target;
    // Move focus to the screen title so screen readers announce the change.
    if (!first) {
      screen.querySelector('h1')?.focus({ preventScroll: true });
      globalThis.scrollTo(0, 0);
    }
  }

  /** @param {string} path e.g. 'book', 'page/3', '' for home */
  go(path) {
    const hash = `#/${path}`;
    if (location.hash === hash) this.route();
    else location.hash = hash;
  }
}
