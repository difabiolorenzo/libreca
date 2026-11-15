/**
 * Spoken announcements for screen readers, through one hidden
 * `aria-live="polite"` region. The same message is not repeated within a
 * short delay, so a hint that stays true is not read again and again.
 */

export class Announcer {
  /**
   * @param {HTMLElement} region element with aria-live="polite"
   * @param {{ repeatAfterMs?: number }} [options] delay before the same message can be read again
   */
  constructor(region, { repeatAfterMs = 8000 } = {}) {
    this.region = region;
    this.repeatAfterMs = repeatAfterMs;
    this.last = '';
    this.lastAt = -Infinity;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
  }

  /**
   * @param {string} text
   * @param {{ force?: boolean }} [options] force: read it even if just said
   */
  say(text, { force = false } = {}) {
    const now = performance.now();
    if (!text || (!force && text === this.last && now - this.lastAt < this.repeatAfterMs)) return;
    this.last = text;
    this.lastAt = now;
    // Empty first, then fill: screen readers read a repeated text again.
    this.region.textContent = '';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.region.textContent = text; }, 50);
  }

  clear() {
    clearTimeout(this.timer);
    this.region.textContent = '';
    this.last = '';
  }
}
