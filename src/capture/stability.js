/**
 * Stability tracking across video frames for automatic capture.
 *
 * A scene is considered stable when:
 * 1. Pixel motion between consecutive frames is below threshold (ignoring camera noise)
 * 2. Page quad corner movement is below threshold
 * 3. Both conditions stay satisfied continuously for a minimum number of frames and duration
 */

import { measureMotion, quadDisplacement, isMotionStable } from '../pipeline/motion.js';

/** @typedef {import('../pipeline/geometry.js').Quad} Quad */
/** @typedef {import('../pipeline/detect-page.js').RgbaImage} RgbaImage */
/** @typedef {import('../pipeline/motion.js').MotionResult} MotionResult */
/** @typedef {import('../pipeline/motion.js').QuadDisplacement} QuadDisplacement */

export { measureMotion, quadDisplacement, isMotionStable };

export class StabilityTracker {
  /**
   * @param {object} [options]
   * @param {number} [options.maxMeanDelta] max average pixel diff to consider stable (default 8)
   * @param {number} [options.maxMovingRatio] max ratio of moving pixels (default 0.05)
   * @param {number} [options.maxQuadDisplacement] max quad corner movement in 0..1 (default 0.02)
   * @param {number} [options.minStableFrames] consecutive stable frames required (default 3)
   * @param {number} [options.minStableDurationMs] consecutive stable time in ms required (default 300)
   */
  constructor({
    maxMeanDelta = 8,
    maxMovingRatio = 0.05,
    maxQuadDisplacement = 0.02,
    minStableFrames = 3,
    minStableDurationMs = 300,
  } = {}) {
    this.maxMeanDelta = maxMeanDelta;
    this.maxMovingRatio = maxMovingRatio;
    this.maxQuadDisplacement = maxQuadDisplacement;
    this.minStableFrames = minStableFrames;
    this.minStableDurationMs = minStableDurationMs;

    this.stableFrames = 0;
    /** @type {number | null} */
    this.stableSince = null;
    /** @type {RgbaImage | null} */
    this.lastImage = null;
    /** @type {Quad | null} */
    this.lastQuad = null;
    /** @type {MotionResult | null} */
    this.lastMotion = null;
    /** @type {QuadDisplacement | null} */
    this.lastDisplacement = null;
  }

  /**
   * Reset the tracker (e.g. on orientation change, camera restart, or after a capture).
   */
  reset() {
    this.stableFrames = 0;
    this.stableSince = null;
    this.lastImage = null;
    this.lastQuad = null;
    this.lastMotion = null;
    this.lastDisplacement = null;
  }

  /**
   * Record a new frame observation.
   *
   * @param {object} [observation]
   * @param {RgbaImage} [observation.image]
   * @param {Quad | null} [observation.quad]
   * @param {number} [observation.timestamp] timestamp in ms (performance.now() by default)
   * @param {MotionResult} [observation.motion] precomputed motion
   * @param {QuadDisplacement} [observation.displacement] precomputed quad displacement
   * @returns {{ stable: boolean, motion: MotionResult | null, displacement: QuadDisplacement | null, stableFrames: number, stableDuration: number }}
   */
  add({ image, quad, timestamp = performance.now(), motion, displacement } = {}) {
    const computedMotion = motion ?? (this.lastImage && image ? measureMotion(this.lastImage, image) : null);
    const computedDisplacement = displacement ?? (this.lastQuad && quad ? quadDisplacement(this.lastQuad, quad) : null);

    const hasMotion = computedMotion !== null;
    const hasDisplacement = computedDisplacement !== null && Number.isFinite(computedDisplacement.max);

    const motionOk = !hasMotion || isMotionStable(computedMotion, {
      maxMeanDelta: this.maxMeanDelta,
      maxMovingRatio: this.maxMovingRatio,
    });
    const quadOk = !hasDisplacement || computedDisplacement.max <= this.maxQuadDisplacement;

    // We consider the frame stationary if at least one metric is available and all available ones are satisfied.
    const stationary = (hasMotion || hasDisplacement) && motionOk && quadOk;

    if (stationary) {
      this.stableFrames++;
      if (this.stableSince === null) this.stableSince = timestamp;
    } else {
      this.stableFrames = 0;
      this.stableSince = null;
    }

    const stableDuration = this.stableSince !== null ? Math.max(0, timestamp - this.stableSince) : 0;
    const stable = this.stableFrames >= this.minStableFrames && stableDuration >= this.minStableDurationMs;

    if (image) this.lastImage = image;
    this.lastQuad = quad ?? null;
    this.lastMotion = computedMotion;
    this.lastDisplacement = computedDisplacement;

    return {
      stable,
      motion: computedMotion,
      displacement: computedDisplacement,
      stableFrames: this.stableFrames,
      stableDuration,
    };
  }

  /**
   * Whether the tracker currently considers the scene stable.
   * @returns {boolean}
   */
  isStable() {
    return this.stableFrames >= this.minStableFrames
      && this.stableSince !== null
      && (performance.now() - this.stableSince) >= this.minStableDurationMs;
  }
}
