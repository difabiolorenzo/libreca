/**
 * Live page detection over the camera preview. Sends small frames to the
 * OpenCV worker (one request at a time, so the preview never waits) and
 * draws the detected page on a canvas laid over the video.
 */

import { grabFrame } from '../lib/image.js';

/** @typedef {import('../pipeline/geometry.js').Quad} Quad */

/** Frames without a page before the outline disappears. */
const MAX_MISSES = 3;

export class LiveDetector {
  /**
   * @param {HTMLVideoElement} video
   * @param {HTMLCanvasElement} overlay canvas covering the video
   * @param {(image: ImageData) => Promise<Quad | null>} detect
   * @param {{ maxSide?: number, interval?: number }} [options] frame size, ms between frames
   */
  constructor(video, overlay, detect, { maxSide = 480, interval = 120 } = {}) {
    this.video = video;
    this.overlay = overlay;
    this.detect = detect;
    this.maxSide = maxSide;
    this.interval = interval;
    this.frameCanvas = document.createElement('canvas');
    /** @type {Quad | null} last detected page (normalized), smoothed */
    this.quad = null;
    this.misses = 0;
    this.running = false;
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
    this.draw();
  }

  async tick() {
    if (!this.running) return;
    const started = performance.now();
    const { video } = this;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      try {
        this.update(await this.detect(grabFrame(video, this.maxSide, this.frameCanvas)));
      } catch {
        this.update(null);
      }
    }
    if (!this.running) return;
    const wait = Math.max(0, this.interval - (performance.now() - started));
    this.timer = setTimeout(() => requestAnimationFrame(() => this.tick()), wait);
  }

  /** @param {Quad | null} found */
  update(found) {
    if (found) {
      // Smooth small jitter between frames.
      const prev = this.quad;
      this.quad = prev
        ? /** @type {Quad} */ (found.map((p, i) => ({
          x: prev[i].x * 0.4 + p.x * 0.6,
          y: prev[i].y * 0.4 + p.y * 0.6,
        })))
        : found;
      this.misses = 0;
    } else if (++this.misses >= MAX_MISSES) {
      this.quad = null;
    }
    this.draw();
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
    const { videoWidth, videoHeight } = this.video;
    if (!this.quad || !videoWidth || !videoHeight) return;
    // The video is shown with object-fit: contain, so find the picture box.
    const scale = Math.min(width / videoWidth, height / videoHeight);
    const boxW = videoWidth * scale;
    const boxH = videoHeight * scale;
    const left = (width - boxW) / 2;
    const top = (height - boxH) / 2;
    const color = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#b5562b';
    ctx.beginPath();
    this.quad.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, left + p.x * boxW, top + p.y * boxH));
    ctx.closePath();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3 * dpr;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}
