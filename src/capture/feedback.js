/**
 * Feedback at every capture, without a white flash: the captured page
 * shrinks from the viewer into the strip of thumbnails, plus an optional
 * short vibration and an optional soft sound (synthesized, no audio file).
 */

/**
 * Animate a picture of the page from one box to another, then remove it.
 * With reduced motion, the picture only fades out where it is.
 * @param {string} url image of the captured page
 * @param {DOMRect} from where it starts (the viewer)
 * @param {DOMRect | null} to where it lands (a thumbnail), null to fade out
 * @returns {Promise<void>}
 */
export async function flyToStrip(url, from, to) {
  const img = document.createElement('img');
  img.className = 'capture-fly';
  img.src = url;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  try {
    await img.decode();
  } catch {
    return;
  }
  // Start as large as possible inside the viewer, keeping the page ratio.
  const ratio = img.naturalWidth / img.naturalHeight || 0.7;
  const width = Math.min(from.width * 0.8, from.height * 0.8 * ratio);
  const height = width / ratio;
  Object.assign(img.style, {
    left: `${from.left + (from.width - width) / 2}px`,
    top: `${from.top + (from.height - height) / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  document.body.append(img);

  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  /** @type {Keyframe[]} */
  let frames = [{ opacity: 1 }, { opacity: 0 }];
  let duration = 200;
  if (!reduced && to && to.width > 0) {
    const startX = from.left + from.width / 2;
    const startY = from.top + from.height / 2;
    const dx = to.left + to.width / 2 - startX;
    const dy = to.top + to.height / 2 - startY;
    const scale = Math.min(to.width / width, to.height / height);
    frames = [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.9 },
    ];
    duration = 420;
  }
  try {
    await img.animate(frames, { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' }).finished;
  } catch {
    // Animation cancelled: nothing to wait for.
  } finally {
    img.remove();
  }
}

/** Short vibration, where the device can vibrate. */
export function vibrate() {
  // Browsers refuse to vibrate before the first tap on the page.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate?.(40);
  } catch {
    // Not allowed (no user gesture yet): stay silent.
  }
}

/** @type {AudioContext | null} */
let audio = null;

/** Soft two-tone click, about 0.15 s, synthesized on the spot. */
export function playSound() {
  try {
    const Context = globalThis.AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    const ctx = /** @type {AudioContext} */ (audio);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const start = ctx.currentTime;
    for (const [offset, frequency] of [[0, 880], [0.07, 1320]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.09);
    }
  } catch {
    // Sound is a convenience: ignore failures.
  }
}
