/**
 * Live page detection over the camera preview. Sends small frames to the
 * OpenCV worker (one request at a time, so the preview never waits) and
 * draws viewfinder corners on the detected page, on a canvas laid over the
 * video. When a page appears, the corners close in on it.
 */

import { grabFrame } from '../lib/image.js';
import { NO_ORIENTATION, orientedSize } from '../lib/orientation.js';
import { viewfinderCorners, squareToQuad } from '../pipeline/geometry.js';
import { StabilityTracker } from './stability.js';

/** @typedef {import('../pipeline/geometry.js').Quad} Quad */
/** @typedef {import('../lib/orientation.js').Orientation} Orientation */
/** @typedef {import('../pipeline/fingerprint.js').Fingerprint} Fingerprint */

/**
 * What the last analysed frame shows (see the worker's `detect` request).
 * @typedef {object} FrameInfo
 * @property {Quad | null} quad page outline, smoothed (null: no page)
 * @property {boolean} stable picture and outline still for a moment
 * @property {number | null} sharpness variance of the Laplacian on the page
 * @property {Fingerprint | null} fingerprint page fingerprint
 * @property {number | null} finger share of skin on the text
 * @property {number | null} brightness mean luminance of the page (0..255)
 * @property {boolean} spread double page
 * @property {number | null} gutter binding position across the double page
 */

/** Frames without a page before the outline disappears. */
const MAX_MISSES = 3;

/**
 * When a page appears, the corners close in on it (200 ms). With reduced
 * motion, they fade in on the spot instead (100 ms).
 */
const CLOSE_IN_MS = 200;
const CLOSE_IN_SPREAD = 1.12;
const FADE_IN_MS = 100;

export class LiveDetector {
  /**
   * @param {HTMLVideoElement} video
   * @param {HTMLCanvasElement} overlay canvas covering the video
   * @param {(image: ImageData) => Promise<any>} detect
   * @param {{
   *   maxSide?: number,
   *   interval?: number,
   *   onDetect?: (found: boolean) => void,
   *   onStability?: (stable: boolean, metrics: { sharpness: number | null, motion: any, quad: Quad | null }) => void,
   *   onFrame?: (info: FrameInfo) => void
   * }} [options] frame size, ms between frames, detection, stability and per-frame callbacks
   */
  constructor(video, overlay, detect, { maxSide = 480, interval = 120, onDetect, onStability, onFrame } = {}) {
    this.video = video;
    this.overlay = overlay;
    this.detect = detect;
    this.maxSide = maxSide;
    this.interval = interval;
    this.onDetect = onDetect;
    this.onStability = onStability;
    this.onFrame = onFrame;
    /** @type {FrameInfo} */
    this.info = emptyInfo();
    this.stability = new StabilityTracker();
    this.isStable = false;
    /** @type {number | null} Laplacian variance */
    this.sharpness = null;
    /** @type {any} pixel motion result */
    this.motion = null;
    /** @type {Orientation} camera rotation and mirror, applied to every frame */
    this.orientation = NO_ORIENTATION;
    this.frameCanvas = document.createElement('canvas');
    /** @type {Quad | null} last detected page (normalized), smoothed */
    this.quad = null;
    this.misses = 0;
    this.running = false;
    this.found = false;
    /** time the current page appeared, for the closing-in animation */
    this.appearedAt = 0;
    this.animating = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.quad = null;
    this.misses = 0;
    this.stability.reset();
    this.isStable = false;
    this.sharpness = null;
    this.motion = null;
    this.info = emptyInfo();
    this.draw();
    this.notify();
  }

  /**
   * Change the camera orientation: the last outline no longer fits.
   * @param {Orientation} orientation
   */
  setOrientation(orientation) {
    this.orientation = orientation;
    this.quad = null;
    this.misses = 0;
    this.stability.reset();
    this.isStable = false;
    this.sharpness = null;
    this.motion = null;
    this.info = emptyInfo();
    this.draw();
    this.notify();
  }

  /** Report a change between "page found" and "no page". */
  notify() {
    const found = this.quad !== null;
    if (found === this.found) return;
    this.found = found;
    this.onDetect?.(found);
  }

  async tick() {
    if (!this.running) return;
    const started = performance.now();
    const { video } = this;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      try {
        this.update(await this.detect(grabFrame(video, this.maxSide, this.frameCanvas, this.orientation)));
      } catch {
        this.update(null);
      }
    }
    if (!this.running) return;
    const wait = Math.max(0, this.interval - (performance.now() - started));
    this.timer = setTimeout(() => requestAnimationFrame(() => this.tick()), wait);
  }

  /** @param {Quad | { quad?: Quad | null, sharpness?: number | null, motion?: any, [key: string]: any } | null} found */
  update(found) {
    const rawQuad = Array.isArray(found) ? found : (found?.quad ?? null);
    const sharpness = (found && !Array.isArray(found) && typeof found.sharpness === 'number') ? found.sharpness : null;
    const motion = (found && !Array.isArray(found) && found.motion) ? found.motion : null;

    this.sharpness = sharpness;
    this.motion = motion;

    if (rawQuad && !this.quad) this.appearedAt = performance.now();
    if (rawQuad) {
      // Smooth small jitter between frames.
      const prev = this.quad;
      this.quad = prev
        ? /** @type {Quad} */ (rawQuad.map((p, i) => ({
          x: prev[i].x * 0.4 + p.x * 0.6,
          y: prev[i].y * 0.4 + p.y * 0.6,
        })))
        : rawQuad;
      this.misses = 0;
    } else if (++this.misses >= MAX_MISSES) {
      this.quad = null;
    }

    const { stable } = this.stability.add({
      quad: this.quad,
      motion,
      timestamp: performance.now(),
    });
    const wasStable = this.isStable;
    this.isStable = stable;
    if (this.isStable !== wasStable) {
      this.onStability?.(this.isStable, {
        sharpness: this.sharpness,
        motion: this.motion,
        quad: this.quad,
      });
    }

    const page = found && !Array.isArray(found) && rawQuad ? found : null;
    this.info = {
      quad: this.quad,
      stable: this.isStable,
      sharpness: this.sharpness,
      fingerprint: page?.fingerprint ?? null,
      finger: page?.finger ?? null,
      brightness: page?.brightness ?? null,
      // Keep the last double page while the outline lasts through a missed frame.
      spread: page ? Boolean(page.spread) : (this.quad ? this.info.spread : false),
      gutter: page ? (page.gutter ?? null) : (this.quad ? this.info.gutter : null),
    };

    this.draw();
    this.notify();
    this.onFrame?.(this.info);
  }

  draw() {
    const canvas = this.overlay;
    const dpr = globalThis.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const { width: videoWidth, height: videoHeight } = orientedSize(this.video.videoWidth, this.video.videoHeight, this.orientation);
    if (!this.quad || !videoWidth || !videoHeight) return;
    // The video is shown oriented with object-fit: contain, so find the picture box.
    const scale = Math.min(width / videoWidth, height / videoHeight);
    const boxW = videoWidth * scale;
    const boxH = videoHeight * scale;
    const left = (width - boxW) / 2;
    const top = (height - boxH) / 2;
    const color = getComputedStyle(canvas).getPropertyValue('--detect').trim() || '#7DD3A8';
    const reduced = this.reducedMotion();
    const progress = Math.min(1, (performance.now() - this.appearedAt) / (reduced ? FADE_IN_MS : CLOSE_IN_MS));
    const eased = reduced ? 1 : 1 - (1 - progress) ** 3;
    const points = this.quad.map((p) => ({ x: left + p.x * boxW, y: top + p.y * boxH }));
    // Double page: a dashed line along the binding.
    const { gutter } = this.info;
    if (this.info.spread && gutter !== null && progress >= 1) {
      const quad = /** @type {Quad} */ (points);
      const start = squareToQuad(quad, gutter, 0.04);
      const end = squareToQuad(quad, gutter, 0.96);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.setLineDash([8 * dpr, 8 * dpr]);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    for (const [a, corner, b] of viewfinderCorners(points, {
      spread: 1 + (CLOSE_IN_SPREAD - 1) * (1 - eased),
      ratio: 0.18,
      maxLength: 40 * dpr,
    })) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(corner.x, corner.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.lineWidth = 4 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = reduced ? progress : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (progress < 1) this.animate();
  }

  /** Redraw on every frame until the closing-in animation ends. */
  animate() {
    if (this.animating) return;
    this.animating = true;
    requestAnimationFrame(() => {
      this.animating = false;
      this.draw();
    });
  }

  reducedMotion() {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}

/** @returns {FrameInfo} */
function emptyInfo() {
  return {
    quad: null, stable: false, sharpness: null, fingerprint: null, finger: null, brightness: null, spread: false, gutter: null,
  };
}
