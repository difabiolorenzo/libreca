/**
 * Automatic capture decision, from what the live detection sees.
 *
 * A page is captured when it is found, still, sharp, without a finger on
 * the text, and different from the page captured last (fingerprint): so
 * the book can rest under the camera without the same page being taken
 * again, and turning the page is enough to capture the next one.
 *
 * No timer and no DOM: the caller feeds one observation per analysed frame.
 */

import { fingerprintDistance, DEFAULT_CHANGE_THRESHOLD } from '../pipeline/fingerprint.js';

/** @typedef {import('../pipeline/fingerprint.js').Fingerprint} Fingerprint */

/**
 * Why the page is not captured yet ('ready' when it can be).
 * @typedef {'noPage' | 'moving' | 'blurry' | 'finger' | 'samePage' | 'wait' | 'ready'} AutoReason
 */

/**
 * @typedef {object} Observation
 * @property {boolean} found a page is detected
 * @property {boolean} stable the picture and the page outline are still
 * @property {boolean} sharp the page is in focus
 * @property {boolean} finger a finger lies on the text
 * @property {Fingerprint | null} fingerprint current page
 * @property {number} now time in ms
 */

export class AutoCapture {
  /**
   * @param {{ changeThreshold?: number, cooldownMs?: number }} [options]
   *   changeThreshold: fingerprint distance from which the page is a new one
   *   cooldownMs: minimum time between two captures
   */
  constructor({ changeThreshold = DEFAULT_CHANGE_THRESHOLD, cooldownMs = 1000 } = {}) {
    this.changeThreshold = changeThreshold;
    this.cooldownMs = cooldownMs;
    /** @type {Fingerprint | null} */
    this.captured = null;
    this.capturedAt = -Infinity;
  }

  /** Forget the last page (new session, other camera, other orientation). */
  reset() {
    this.captured = null;
    this.capturedAt = -Infinity;
  }

  /**
   * Remember the page just captured (automatically or by hand).
   * @param {Fingerprint | null} fingerprint
   * @param {number} now
   */
  markCaptured(fingerprint, now) {
    this.captured = fingerprint;
    this.capturedAt = now;
  }

  /**
   * @param {Observation} observation
   * @returns {AutoReason}
   */
  evaluate({ found, stable, sharp, finger, fingerprint, now }) {
    if (!found) return 'noPage';
    if (finger) return 'finger';
    if (!stable) return 'moving';
    if (!sharp) return 'blurry';
    if (this.captured && fingerprintDistance(fingerprint, this.captured) <= this.changeThreshold) return 'samePage';
    if (now - this.capturedAt < this.cooldownMs) return 'wait';
    return 'ready';
  }
}
