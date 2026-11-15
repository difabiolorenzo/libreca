/**
 * Entry point (v0.1 prototype): screens (library, capture, book, page
 * review, settings), camera with live page detection, manual capture with
 * perspective correction, manual corner adjustment, simple PDF export.
 */

import { t, setLanguage, getLanguage, matchLanguage, LANGUAGES, i18nEvents } from './i18n/i18n.js';
import { getSetting, setSetting } from './lib/settings.js';
import { THEMES, getTheme, applyTheme, setTheme, watchSystemTheme } from './lib/theme.js';
import { loadOpenCV, callOpenCV, OpenCvMissingError } from './lib/opencv.js';
import { grabFrame, imageToJpeg, blobToImageData } from './lib/image.js';
import { isCameraSupported, listCameras, startCamera, stopCamera, cameraErrorKey } from './capture/camera.js';
import { LiveDetector } from './capture/live-detector.js';
import { CornerEditor } from './ui/corner-editor.js';
import { PageList } from './ui/page-list.js';
import { createPageThumb } from './ui/page-thumb.js';
import { Screens } from './ui/screens.js';
import { applyIcons, createIcon } from './ui/icons.js';
import { setChip } from './ui/status-chip.js';
import { buildPdf } from './export/pdf.js';

/** @typedef {import('./ui/page-list.js').Page} Page */
/** @typedef {'ok' | 'warning' | 'error' | ''} State */

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

/** @type {Record<string, import('./ui/status-chip.js').Tone>} */
const CHIP_TONES = { ok: 'ok', warning: 'warning', error: 'danger', '': 'info' };

/** Pages shown in the strip of the capture screen. */
const STRIP_SIZE = 4;

/**
 * Show a translated status. Kept as key + params so it can be re-translated
 * when the language changes. A `.chip` element is drawn as a StatusChip.
 * @param {HTMLElement} el
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @param {State} [state]
 */
function setStatus(el, key, params = {}, state = '') {
  el.dataset.key = key;
  el.dataset.params = JSON.stringify(params);
  el.dataset.state = state;
  renderStatus(el);
}

/** @param {HTMLElement} el */
function renderStatus(el) {
  const text = t(el.dataset.key ?? '', JSON.parse(el.dataset.params || '{}'));
  if (el.classList.contains('chip')) setChip(el, CHIP_TONES[el.dataset.state ?? ''] ?? 'info', text);
  else el.textContent = text;
}

/** @param {HTMLElement} el */
function clearStatus(el) {
  delete el.dataset.key;
  el.replaceChildren();
}

function retranslateStatuses() {
  for (const el of document.querySelectorAll('output[data-key]')) renderStatus(/** @type {HTMLElement} */ (el));
}

/** @param {number} count */
const pageCount = (count) => t(count < 2 ? 'book.pagesOne' : 'book.pagesOther', { count });

// --- Settings -----------------------------------------------------------

function initLanguageSelect() {
  const select = $('language-select');
  for (const [code, { name }] of Object.entries(LANGUAGES)) {
    select.add(new Option(name, code));
  }
  select.value = getLanguage();
  select.addEventListener('change', async () => {
    setSetting('language', select.value);
    await setLanguage(select.value);
  });
}

function fillThemeSelect() {
  const select = $('theme-select');
  const value = select.value || getTheme();
  select.replaceChildren(...THEMES.map((theme) => new Option(t(`settings.themes.${theme}`), theme)));
  select.value = value;
}

function initThemeSelect() {
  fillThemeSelect();
  $('theme-select').addEventListener('change', () => setTheme($('theme-select').value));
  watchSystemTheme();
}

async function refreshCameraList() {
  if (!isCameraSupported()) return;
  const select = $('camera-select');
  const wanted = select.value || getSetting('cameraId', '');
  const cameras = await listCameras();
  select.replaceChildren(new Option(t('camera.defaultSource'), ''));
  cameras.forEach((cam, i) => {
    select.add(new Option(cam.label || t('camera.unnamed', { index: i + 1 }), cam.deviceId));
  });
  select.value = cameras.some((c) => c.deviceId === wanted) ? wanted : '';
  select.disabled = false;
}

function initCameraSelect() {
  $('camera-select').addEventListener('change', () => setSetting('cameraId', $('camera-select').value));
  navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshCameraList().catch(() => {}));
  refreshCameraList().catch(() => {});
}

// --- Diagnostics --------------------------------------------------------

let opencvReady = false;

function checkSecureContext() {
  const ok = window.isSecureContext;
  setStatus($('secure-status'), ok ? 'diagnostics.yes' : 'diagnostics.no', {}, ok ? 'ok' : 'error');
}

async function checkOpenCV() {
  const out = $('opencv-status');
  setStatus(out, 'diagnostics.loading');
  try {
    const { version } = await loadOpenCV();
    setStatus(out, 'diagnostics.loaded', { version }, 'ok');
    opencvReady = true;
    updateCaptureState();
  } catch (error) {
    if (error instanceof OpenCvMissingError) {
      setStatus(out, 'diagnostics.missing', {}, 'error');
    } else {
      setStatus(out, 'diagnostics.failed', { error: String(error) }, 'error');
    }
  }
}

// --- Capture screen: camera and live detection -----------------------------

/** @type {MediaStream | null} */
let stream = null;
/** @type {LiveDetector} */
let detector;
let capturing = false;
/** Bumped on every start/stop so a late camera start is dropped. */
let cameraSession = 0;

function updateCaptureState() {
  $('capture').disabled = !(stream && opencvReady) || capturing;
  const status = $('scan-status');
  if (stream && !opencvReady) setStatus(status, 'scan.waitOpencv');
  if (opencvReady && status.dataset.key === 'scan.waitOpencv') clearStatus(status);
  if (stream && opencvReady) detector.start();
}

async function startCapture() {
  const status = $('camera-status');
  const session = ++cameraSession;
  if (!window.isSecureContext) return setStatus(status, 'camera.insecure', {}, 'error');
  if (!isCameraSupported()) return setStatus(status, 'camera.unsupported', {}, 'error');
  setStatus(status, 'camera.starting');
  try {
    const chosen = getSetting('cameraId', '') || undefined;
    // A remembered camera may be gone (unplugged webcam): fall back to the default one.
    const started = await startCamera(chosen).catch((error) => {
      if (chosen && error?.name === 'OverconstrainedError') return startCamera();
      throw error;
    });
    if (session !== cameraSession) return stopCamera(started); // left the screen meanwhile
    stream = started;
    const video = $('camera-preview');
    video.srcObject = stream;
    await video.play();
    clearStatus(status);
    refreshCameraList().catch(() => {}); // labels become available after permission
  } catch (error) {
    if (session !== cameraSession) return;
    stream = null;
    setStatus(status, cameraErrorKey(error), { error: String(error) }, 'error');
  }
  updateCaptureState();
}

function stopCapture() {
  cameraSession++;
  detector.stop();
  stopCamera(stream);
  stream = null;
  $('camera-preview').srcObject = null;
  clearStatus($('scan-status'));
  updateCaptureState();
}

/** @param {boolean} found */
function onPageDetected(found) {
  $('capture').toggleAttribute('data-detected', found);
  if (found) setStatus($('detect-chip'), 'scan.detected', {}, 'ok');
  else clearStatus($('detect-chip'));
}

/** @type {PageList} */
let pages;
/** @type {CornerEditor} */
let cornerEditor;
/** @type {Screens} */
let screens;

/** @param {{ width: number, height: number, data: Uint8ClampedArray }} image */
const toJpeg = (image) => imageToJpeg(image, 0.9);

async function onCapture() {
  const video = $('camera-preview');
  const status = $('scan-status');
  if (!stream || capturing || !video.videoWidth) return;
  capturing = true;
  updateCaptureState();
  setStatus(status, 'scan.capturing');
  try {
    const frame = grabFrame(video);
    const photo = toJpeg(frame); // copies the pixels before the transfer below
    const result = await callOpenCV('process', { image: frame, fallback: detector.quad }, [frame.data.buffer]);
    const page = pages.add({ photo: await photo, quad: result.quad, image: await toJpeg(result.image), detected: result.detected });
    const number = pages.numberOf(page.id);
    setStatus(status, result.detected ? 'scan.captured' : 'scan.noPage', { number }, result.detected ? 'ok' : 'warning');
  } catch (error) {
    setStatus(status, 'scan.failed', { error: String(error) }, 'error');
  } finally {
    capturing = false;
    updateCaptureState();
  }
}

function initCapture() {
  detector = new LiveDetector($('camera-preview'), $('page-overlay'),
    async (image) => (await callOpenCV('detect', { image }, [image.data.buffer])).quad,
    { onDetect: onPageDetected });
  $('capture').addEventListener('click', onCapture);
  // Escape leaves the capture screen (the corner dialog handles its own).
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.dataset.screen === 'capture') screens.go('book');
  });
}

// --- Drawing the book on every screen --------------------------------------

/**
 * @param {Page} page
 * @param {boolean} current
 */
function thumbFor(page, current) {
  const thumb = createPageThumb({ url: page.url, number: pages.numberOf(page.id), retake: !page.detected, current });
  thumb.addEventListener('click', () => screens.go(`page/${page.id}`));
  const item = document.createElement('li');
  item.append(thumb);
  return item;
}

function renderBook() {
  const list = pages.pages;
  const count = list.length;
  const last = list.at(-1);

  // Library card.
  const cover = $('library-cover');
  if (list[0]) {
    const img = document.createElement('img');
    img.src = list[0].url;
    img.alt = '';
    cover.replaceChildren(img);
  } else {
    cover.replaceChildren(createIcon('book'));
  }
  $('library-book-meta').textContent = count ? pageCount(count) : t('library.empty');
  $('library-open').hidden = count === 0;

  // Book screen.
  $('book-meta').textContent = pageCount(count);
  if (count === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = t('pages.empty');
    $('page-list').replaceChildren(empty);
  } else {
    $('page-list').replaceChildren(...list.map((page) => thumbFor(page, page === last)));
  }
  $('export-pdf').disabled = count === 0;

  // Capture screen.
  $('capture-strip').replaceChildren(...list.slice(-STRIP_SIZE).map((page) => thumbFor(page, page === last)));
  $('capture-count').textContent = pageCount(count);
  $('capture-next').textContent = t('capture.next', { number: count + 1 });

  if (document.body.dataset.screen === 'page') renderReview();
}

// --- Page review screen ----------------------------------------------------

/** @type {number} id of the page shown */
let reviewId = 0;

/** @returns {boolean} false if the page does not exist */
function renderReview() {
  const page = pages.get(reviewId);
  if (!page) return false;
  const number = pages.numberOf(page.id);
  $('review-title').textContent = t('review.title', { number, count: pages.pages.length });
  const img = $('review-image');
  img.src = page.url;
  img.alt = t('review.image', { number });
  setStatus($('review-state'), page.detected ? 'review.stateDone' : 'review.stateRetake', {}, page.detected ? 'ok' : 'warning');
  return true;
}

async function onAdjust() {
  const page = pages.get(reviewId);
  if (!page) return;
  const quad = await cornerEditor.open(page.photo, page.quad);
  if (!quad) return;
  const status = $('review-status');
  setStatus(status, 'corners.applying');
  try {
    const image = await blobToImageData(page.photo);
    const result = await callOpenCV('warp', { image, quad }, [image.data.buffer]);
    pages.update(page.id, { quad, image: await toJpeg(result.image) });
    clearStatus(status);
  } catch (error) {
    setStatus(status, 'corners.failed', { error: String(error) }, 'error');
  }
}

function onDelete() {
  const number = pages.numberOf(reviewId);
  if (!number || !globalThis.confirm(t('review.confirmDelete', { number }))) return;
  pages.remove(reviewId);
  screens.go('book');
}

function initReview() {
  cornerEditor = new CornerEditor($('corner-dialog'));
  $('review-adjust').addEventListener('click', onAdjust);
  $('review-delete').addEventListener('click', onDelete);
}

// --- PDF export ---------------------------------------------------------------

/**
 * @param {Blob} blob
 * @param {string} filename
 */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function onExport() {
  const status = $('export-status');
  const button = $('export-pdf');
  button.disabled = true;
  setStatus(status, 'pages.exporting');
  try {
    const jpegs = await Promise.all(pages.pages.map(async (p) => new Uint8Array(await p.image.arrayBuffer())));
    const pdf = buildPdf(jpegs);
    const date = new Date().toISOString().slice(0, 10);
    download(new Blob([pdf], { type: 'application/pdf' }), `libreca-${date}.pdf`);
    setStatus(status, 'pages.exported', { pages: pageCount(jpegs.length) }, 'ok');
  } catch (error) {
    setStatus(status, 'pages.exportFailed', { error: String(error) }, 'error');
  } finally {
    button.disabled = pages.pages.length === 0;
  }
}

// --- Boot ---------------------------------------------------------------

async function main() {
  applyTheme(getTheme());
  applyIcons(document);
  const lang = getSetting('language', matchLanguage(navigator.languages ?? []));
  await setLanguage(lang);

  pages = new PageList(renderBook);
  initLanguageSelect();
  initThemeSelect();
  initCameraSelect();
  initCapture();
  initReview();
  $('export-pdf').addEventListener('click', onExport);

  screens = new Screens(document, {
    capture: { enter: () => { startCapture(); }, leave: stopCapture },
    page: {
      enter: (param) => {
        reviewId = Number(param);
        return renderReview();
      },
      leave: () => clearStatus($('review-status')),
    },
    settings: { enter: () => { refreshCameraList().catch(() => {}); } },
  }, 'library');

  i18nEvents.addEventListener('change', () => {
    retranslateStatuses();
    fillThemeSelect();
    renderBook();
    refreshCameraList().catch(() => {});
  });

  renderBook();
  screens.route();
  checkSecureContext();
  checkOpenCV();
}

main();
