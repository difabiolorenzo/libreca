/**
 * Entry point: screens (library, capture, book, page review), settings
 * dialog, camera with live page detection, rotation and mirror, automatic
 * or manual capture (stillness, sharpness, page change, finger on the text,
 * light) with feedback and spoken announcements, double pages split at the
 * binding, perspective correction, corrections (curvature, cleaning and
 * colour mode, uniform margins) shown before/after and undoable one by one,
 * manual corner adjustment, retake, page orientation, book title, simple
 * PDF export.
 */

import { t, setLanguage, getLanguage, matchLanguage, LANGUAGES, i18nEvents } from './i18n/i18n.js';
import { getSetting, setSetting } from './lib/settings.js';
import { THEMES, getTheme, applyTheme, setTheme, watchSystemTheme } from './lib/theme.js';
import { loadOpenCV, callOpenCV, OpenCvMissingError } from './lib/opencv.js';
import { grabFrame, imageToJpeg, blobToImageData, orientJpeg } from './lib/image.js';
import { normalizeRotation, rotate, toggleMirror, orientationTransform } from './lib/orientation.js';
import { isCameraSupported, listCameras, startCamera, stopCamera, cameraErrorKey } from './capture/camera.js';
import { LiveDetector } from './capture/live-detector.js';
import { AutoCapture } from './capture/auto-capture.js';
import { flyToStrip, vibrate, playSound } from './capture/feedback.js';
import { isSharp } from './pipeline/sharpness.js';
import { DEFAULT_FINGER_THRESHOLD } from './pipeline/fingers.js';
import { CORRECTIONS, DEFAULT_CORRECTIONS } from './pipeline/enhance.js';
import { COLOR_MODES } from './pipeline/clean.js';
import { Announcer } from './ui/announcer.js';
import { CornerEditor } from './ui/corner-editor.js';
import { PageList, toRecord } from './ui/page-list.js';
import { createPageThumb } from './ui/page-thumb.js';
import { Screens } from './ui/screens.js';
import { applyIcons, createIcon } from './ui/icons.js';
import { setChip } from './ui/status-chip.js';
import { buildPdf, jpegInfo } from './export/pdf.js';
import { renderCover } from './export/cover.js';
import { Ocr } from './export/ocr.js';
import {
  listBooks, getBook, createBook, saveBook, deleteBook, loadPages, coverOf, savePage, deletePage, persistStorage,
} from './lib/store.js';
import { enableDragReorder } from './ui/reorder.js';

/** @typedef {import('./ui/page-list.js').Page} Page */
/** @typedef {'ok' | 'warning' | 'error' | ''} State */
/** @typedef {import('./lib/orientation.js').Orientation} Orientation */
/** @typedef {import('./pipeline/enhance.js').Corrections} Corrections */
/** @typedef {import('./pipeline/clean.js').ColorMode} ColorMode */

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

/** @type {Record<string, import('./ui/status-chip.js').Tone>} */
const CHIP_TONES = { ok: 'ok', warning: 'warning', error: 'danger', '': 'info' };

/** Pages shown in the strip of the capture screen. */
const STRIP_SIZE = 4;

/** Mean page luminance (0..255) below which the light is too low. */
const DARK_LIMIT = 60;

/** Frames in a row before a hint appears over the feed (or goes away). */
const HINT_FRAMES = 3;

/** @type {Announcer} */
let announcer;

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
  $('camera-switch').hidden = cameras.length < 2;
}

/**
 * Remember a camera and use it right away if the capture screen is open.
 * @param {string} deviceId '' for the default camera
 */
function chooseCamera(deviceId) {
  setSetting('cameraId', deviceId);
  $('camera-select').value = deviceId;
  if (document.body.dataset.screen === 'capture') {
    stopCapture();
    startCapture();
  }
}

/** Capture screen: go to the next camera in the list. */
async function switchCamera() {
  const cameras = await listCameras();
  if (cameras.length < 2) return;
  const current = stream?.getVideoTracks()[0]?.getSettings().deviceId ?? getSetting('cameraId', '');
  const index = cameras.findIndex((c) => c.deviceId === current);
  chooseCamera(cameras[(index + 1) % cameras.length].deviceId);
}

function initCameraSelect() {
  $('camera-select').addEventListener('change', () => chooseCamera($('camera-select').value));
  $('camera-switch').addEventListener('click', () => switchCamera().catch(() => {}));
  navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshCameraList().catch(() => {}));
  refreshCameraList().catch(() => {});
}

/**
 * A switch in the settings, kept in localStorage.
 * @param {string} id input id
 * @param {string} key setting name
 * @param {boolean} fallback default value
 */
function initToggle(id, key, fallback) {
  const input = $(id);
  input.checked = getSetting(key, fallback) === true;
  input.addEventListener('change', () => setSetting(key, input.checked));
}

/**
 * Fill a select with the colour modes, keeping its value.
 * @param {HTMLSelectElement} select
 * @param {string} fallback
 */
function fillColorSelect(select, fallback) {
  const value = select.value || fallback;
  select.replaceChildren(...COLOR_MODES.map((mode) => new Option(t(`colors.${mode}`), mode)));
  select.value = value;
}

/** @returns {ColorMode} colour mode of new pages */
function defaultColorMode() {
  const mode = getSetting('colorMode', 'color');
  return COLOR_MODES.includes(mode) ? mode : 'color';
}

/** @returns {Corrections} corrections of new pages */
const defaultCorrections = () => ({ ...DEFAULT_CORRECTIONS, color: defaultColorMode() });

function initCaptureSettings() {
  const color = $('color-select');
  fillColorSelect(color, defaultColorMode());
  color.addEventListener('change', () => setSetting('colorMode', color.value));
  initToggle('split-toggle', 'splitSpreads', true);
  initToggle('vibrate-toggle', 'captureVibrate', true);
  initToggle('sound-toggle', 'captureSound', true);
  // Most computers cannot vibrate: no setting to show there.
  $('vibrate-row').hidden = typeof navigator.vibrate !== 'function';
}

function initSettingsDialog() {
  const dialog = $('settings-dialog');
  document.addEventListener('click', (event) => {
    const action = /** @type {HTMLElement} */ (event.target).closest?.('[data-action="settings"]');
    if (!action) return;
    refreshCameraList().catch(() => {});
    dialog.showModal();
  });
  dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close());
  // A click on the backdrop closes the dialog too.
  dialog.addEventListener('click', (/** @type {MouseEvent} */ event) => {
    if (event.target === dialog) dialog.close();
  });
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

/** @type {Orientation} rotation and mirror of the camera, remembered */
let cameraOrientation = {
  rotation: normalizeRotation(getSetting('cameraRotation', 0)),
  mirror: getSetting('cameraMirror', false) === true,
};

/** @param {Orientation} orientation */
function setCameraOrientation(orientation) {
  cameraOrientation = orientation;
  setSetting('cameraRotation', orientation.rotation);
  setSetting('cameraMirror', orientation.mirror);
  applyCameraOrientation();
}

function applyCameraOrientation() {
  const video = $('camera-preview');
  video.style.setProperty('--camera-transform', orientationTransform(cameraOrientation));
  video.classList.toggle('quarter-turn', cameraOrientation.rotation % 180 !== 0);
  $('camera-mirror').setAttribute('aria-pressed', String(cameraOrientation.mirror));
  detector.setOrientation(cameraOrientation);
}

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
  clearStatus($('detect-chip'));
  for (const hint of Object.values(hints)) hint.reset();
  announcer.clear();
  updateCaptureState();
}

/** @param {boolean} found */
function onPageDetected(found) {
  $('capture').toggleAttribute('data-detected', found);
}

/**
 * A warning over the feed (finger, blur, low light), shown once it has
 * lasted a few frames so it does not flicker, and announced when it appears.
 * @param {string} chipId
 * @param {string} key translation key
 */
function createHint(chipId, key) {
  let count = 0;
  let shown = false;
  return {
    /** @param {boolean} active */
    update(active) {
      count = active ? Math.max(1, count + 1) : Math.min(-1, count - 1);
      if (!shown && count >= HINT_FRAMES) {
        shown = true;
        setStatus($(chipId), key, {}, 'warning');
        announcer.say(t(key));
      } else if (shown && count <= -HINT_FRAMES) {
        shown = false;
        clearStatus($(chipId));
      }
    },
    reset() {
      count = 0;
      shown = false;
      clearStatus($(chipId));
    },
  };
}

/** @type {Record<'finger' | 'blurry' | 'dark', ReturnType<typeof createHint>>} */
let hints;

/** Automatic capture: on unless the user turned it off. */
let autoMode = getSetting('autoCapture', true) !== false;
const autoCapture = new AutoCapture();

/** @param {boolean} on */
function setAutoMode(on) {
  autoMode = on;
  setSetting('autoCapture', on);
  $('capture-auto').setAttribute('aria-pressed', String(on));
  $('capture').dataset.mode = on ? 'auto' : 'manual';
}

/**
 * Every analysed frame: status chips over the feed, then the automatic
 * capture decision.
 * @param {import('./capture/live-detector.js').FrameInfo} info
 */
function onFrame(info) {
  const found = info.quad !== null;
  if (found) setStatus($('detect-chip'), info.spread ? 'scan.detectedSpread' : 'scan.detected', {}, 'ok');
  else clearStatus($('detect-chip'));

  const finger = found && (info.finger ?? 0) > DEFAULT_FINGER_THRESHOLD;
  const sharp = info.sharpness !== null && isSharp(info.sharpness);
  hints.finger.update(finger);
  // Blur only matters once the page is still (moving pictures are blurred).
  hints.blurry.update(found && info.stable && info.sharpness !== null && !sharp);
  hints.dark.update(found && info.brightness !== null && info.brightness < DARK_LIMIT);

  if (!autoMode || capturing || !stream || !opencvReady) return;
  const reason = autoCapture.evaluate({
    found, stable: info.stable, sharp, finger, fingerprint: info.fingerprint, now: performance.now(),
  });
  if (reason === 'ready') onCapture();
}

/** @type {PageList} */
let pages;
/** @type {CornerEditor} */
let cornerEditor;
/** @type {Screens} */
let screens;

/** @param {{ width: number, height: number, data: Uint8ClampedArray }} image */
const toJpeg = (image) => imageToJpeg(image, 0.9);

/** Page being retaken (its next capture replaces it), 0 if none. */
let retakeId = 0;

async function onCapture() {
  const video = $('camera-preview');
  const status = $('scan-status');
  if (!stream || capturing || !video.videoWidth) return;
  capturing = true;
  updateCaptureState();
  setStatus(status, 'scan.capturing');
  const { fingerprint } = detector.info;
  try {
    const frame = grabFrame(video, Infinity, undefined, cameraOrientation);
    const photo = toJpeg(frame); // copies the pixels before the transfer below
    const corrections = defaultCorrections();
    const result = await callOpenCV('process', {
      image: frame, fallback: detector.quad, split: getSetting('splitSpreads', true) === true, corrections,
    }, [frame.data.buffer]);
    const shot = await photo;
    const images = await Promise.all(result.pages.map(async (/** @type {any} */ p) => ({
      straight: await toJpeg(p.image), enhanced: await toJpeg(p.enhanced),
    })));
    // A retaken page is replaced where it was in the book.
    const replaced = retakeId ? pages.numberOf(retakeId) : 0;
    let index = replaced ? replaced - 1 : pages.pages.length;
    if (replaced) pages.remove(retakeId);
    retakeId = 0;
    const added = result.pages.map((/** @type {any} */ p, /** @type {number} */ i) => pages.add({
      photo: shot, quad: p.quad, detected: result.detected, straight: images[i].straight,
      enhanced: images[i].enhanced, image: images[i].enhanced, corrections, applied: p.applied,
    }, index++));
    // This page is taken: the automatic capture waits for the next one.
    autoCapture.markCaptured(fingerprint, performance.now());
    const numbers = added.map((/** @type {Page} */ page) => pages.numberOf(page.id));
    /** @type {[string, Record<string, number>]} */
    const [key, params] = !result.detected ? ['scan.noPage', { number: numbers[0] }]
      : numbers.length > 1 ? ['scan.capturedTwo', { first: numbers[0], second: numbers[1] }]
        : ['scan.captured', { number: numbers[0] }];
    setStatus(status, key, params, result.detected ? 'ok' : 'warning');
    announcer.say(t(key, params), { force: true });
    captureFeedback(added.at(-1)?.url);
    if (replaced) screens.go(`page/${added[0].id}`);
  } catch (error) {
    setStatus(status, 'scan.failed', { error: String(error) }, 'error');
    announcer.say(t('scan.failed', { error: String(error) }), { force: true });
  } finally {
    capturing = false;
    updateCaptureState();
  }
}

/**
 * The page shrinks into the strip, with a short vibration and sound if
 * turned on.
 * @param {string | undefined} url
 */
function captureFeedback(url) {
  if (getSetting('captureVibrate', true) === true) vibrate();
  if (getSetting('captureSound', true) === true) playSound();
  if (!url) return;
  // The strip is hidden in landscape: the page then flies to the page number.
  const thumb = $('capture-strip').lastElementChild?.querySelector('img');
  const target = thumb?.getClientRects().length ? thumb : $('capture-next');
  flyToStrip(url, $('viewer').getBoundingClientRect(), target?.getBoundingClientRect() ?? null);
}

/**
 * Space captures, on the capture screen only, unless a dialog is open or a
 * control has the focus (Space then works that control).
 * @param {KeyboardEvent} event
 */
function onCaptureKey(event) {
  if (event.code !== 'Space' && event.key !== ' ') return;
  if (document.body.dataset.screen !== 'capture' || document.querySelector('dialog[open]')) return;
  const target = /** @type {HTMLElement} */ (event.target);
  if (target.closest?.('button, a, input, select, textarea, [contenteditable]')) return;
  event.preventDefault();
  if (!event.repeat && !$('capture').disabled) onCapture();
}

function initCapture() {
  detector = new LiveDetector($('camera-preview'), $('page-overlay'),
    async (image) => await callOpenCV('detect', { image }, [image.data.buffer]),
    { onDetect: onPageDetected, onFrame });
  hints = {
    finger: createHint('finger-chip', 'scan.finger'),
    blurry: createHint('blur-chip', 'scan.blurry'),
    dark: createHint('light-chip', 'scan.dark'),
  };
  $('capture').addEventListener('click', onCapture);
  $('capture-auto').addEventListener('click', () => {
    setAutoMode(!autoMode);
    announcer.say(t(autoMode ? 'capture.autoOn' : 'capture.autoOff'), { force: true });
  });
  setAutoMode(autoMode);
  document.addEventListener('keydown', onCaptureKey);
  $('camera-rotate-left').addEventListener('click', () => setCameraOrientation(rotate(cameraOrientation, -90)));
  $('camera-rotate-right').addEventListener('click', () => setCameraOrientation(rotate(cameraOrientation, 90)));
  $('camera-mirror').addEventListener('click', () => setCameraOrientation(toggleMirror(cameraOrientation)));
  applyCameraOrientation();
  // Escape leaves the capture screen (an open dialog handles its own).
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.dataset.screen === 'capture'
      && !document.querySelector('dialog[open]')) screens.go('book');
  });
}

// --- The open book: saved on this device -------------------------------------

/** @type {import('./lib/store.js').BookRecord | null} the open book */
let book = null;

/** Title of the open book, '' until renamed. */
const bookTitle = () => book?.title ?? '';

/**
 * The page is the book's cover photo: marked as such and still first.
 * @param {number | undefined} id
 */
const isCover = (id) => !!id && book?.coverId === id && pages.pages[0]?.id === id;

/** Saves run one after the other, in the order of the changes. */
let saving = Promise.resolve();

/** @param {() => Promise<unknown>} task */
function save(task) {
  saving = saving.then(task).then(() => {}, (error) => {
    setStatus($('save-status'), 'library.saveFailed', { error: String(error) }, 'error');
  });
  return saving;
}

/** Save the open book's title, page order and next page id. */
function saveBookRecord() {
  if (!book) return;
  book.order = pages.pages.map((p) => p.id);
  book.nextId = pages.nextId;
  book.updated = Date.now();
  const record = { ...book, order: [...book.order] };
  save(() => saveBook(record));
}

/** @param {import('./ui/page-list.js').PageChange} change */
function onPagesChange(change) {
  renderBook();
  if (!book || change.type === 'load') return;
  const bookId = book.id;
  if (change.type === 'add' || change.type === 'update') {
    const record = toRecord(change.page);
    save(() => savePage(bookId, record));
  } else if (change.type === 'remove') {
    const { id } = change;
    save(() => deletePage(bookId, id));
  }
  saveBookRecord();
}

/**
 * Open a saved book (its pages are loaded into memory).
 * @param {number} id
 * @returns {Promise<boolean>} false if it does not exist
 */
async function openBook(id) {
  if (book?.id === id) return true;
  await saving;
  const found = id ? await getBook(id) : undefined;
  if (!found) return false;
  book = found;
  setSetting('bookId', id);
  pages.load(await loadPages(found), found.nextId);
  return true;
}

/** @returns {Promise<void>} a book is open (a new one if needed) */
async function ensureBook() {
  if (book) return;
  const created = await createBook();
  persistStorage();
  await openBook(created.id);
}

function closeBook() {
  book = null;
  setSetting('bookId', 0);
  pages.load([], 1);
}

function onRename() {
  if (!book) return;
  const title = globalThis.prompt(t('book.renamePrompt'), bookTitle() || t('book.untitled'));
  if (title === null) return;
  book.title = title.trim();
  renderBook();
  saveBookRecord();
}

function onAuthorChange() {
  if (!book) return;
  const author = $('book-author').value.trim();
  if (author === (book.author ?? '')) return;
  book.author = author;
  saveBookRecord();
}

// --- Library: the saved books -------------------------------------------------

/** Object URLs of the covers shown, revoked on the next drawing. */
let coverUrls = /** @type {string[]} */ ([]);
let libraryDrawing = 0;

/**
 * @param {Blob | null} image
 * @returns {HTMLElement}
 */
function coverFor(image) {
  const cover = document.createElement('div');
  cover.className = 'book-cover';
  if (image) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(image);
    img.alt = '';
    coverUrls.push(img.src);
    cover.append(img);
  } else {
    cover.append(createIcon('book'));
  }
  return cover;
}

/**
 * @param {string} text
 * @param {string} [className]
 */
function span(text, className = '') {
  const el = document.createElement('span');
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

/**
 * @param {import('./lib/store.js').BookRecord} record
 * @param {Blob | null} cover
 */
function bookCard(record, cover) {
  const item = document.createElement('li');
  const card = document.createElement('article');
  card.className = 'book-card card';
  const titleId = `library-book-${record.id}`;
  card.setAttribute('aria-labelledby', titleId);
  const body = document.createElement('div');
  body.className = 'book-card-body';
  const title = document.createElement('h3');
  title.id = titleId;
  title.className = 'book-title';
  title.textContent = record.title || t('book.untitled');
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = record.order.length ? pageCount(record.order.length) : t('library.empty');
  const actions = document.createElement('div');
  actions.className = 'btn-row';
  const open = document.createElement('a');
  open.className = 'btn btn-secondary';
  open.href = `#/book/${record.id}`;
  open.append(createIcon('book'), span(t('library.open')));
  const label = t('library.delete', { title: title.textContent });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-secondary btn-icon btn-danger';
  remove.dataset.deleteBook = String(record.id);
  remove.setAttribute('aria-label', label);
  remove.title = label;
  remove.append(createIcon('trash'));
  actions.append(open, remove);
  body.append(title, meta, actions);
  card.append(coverFor(cover), body);
  item.append(card);
  return item;
}

async function renderLibrary() {
  const drawing = ++libraryDrawing;
  await saving;
  const books = await listBooks();
  const covers = await Promise.all(books.map(coverOf));
  if (drawing !== libraryDrawing) return;
  for (const url of coverUrls) URL.revokeObjectURL(url);
  coverUrls = [];
  $('library-list').replaceChildren(...books.map((record, i) => bookCard(record, covers[i])));
  $('library-none').hidden = books.length > 0;
}

async function onNewBook() {
  await saving;
  closeBook();
  await ensureBook();
  screens.go('capture');
}

/** @param {MouseEvent} event */
async function onLibraryClick(event) {
  const button = /** @type {HTMLElement} */ (event.target).closest?.('[data-delete-book]');
  if (!button) return;
  const id = Number(button.getAttribute('data-delete-book'));
  const record = await getBook(id);
  if (!record) return;
  const title = record.title || t('book.untitled');
  if (!globalThis.confirm(t('library.confirmDelete', { title, pages: pageCount(record.order.length) }))) return;
  await saving;
  if (book?.id === id) closeBook();
  await deleteBook(id);
  announcer.say(t('library.deleted', { title }), { force: true });
  renderLibrary();
}

// --- Drawing the book on every screen --------------------------------------

/** Book screen: show the Up / Down / Retake / Delete buttons of each page. */
let organizing = false;

/**
 * @param {import('./ui/icons.js').IconName} icon
 * @param {string} label
 * @param {string} action
 * @param {boolean} [disabled]
 */
function pageButton(icon, label, action, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-secondary btn-icon${action === 'delete' ? ' btn-danger' : ''}`;
  button.dataset.pageAction = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = disabled;
  button.append(createIcon(icon));
  return button;
}

/**
 * @param {Page} page
 * @param {boolean} current
 * @param {boolean} [tools] book screen: draggable, with the organize buttons
 */
function thumbFor(page, current, tools = false) {
  const number = pages.numberOf(page.id);
  const thumb = createPageThumb({ url: page.url, number, retake: !page.detected, current, cover: isCover(page.id) });
  thumb.addEventListener('click', () => screens.go(`page/${page.id}`));
  const item = document.createElement('li');
  item.dataset.id = String(page.id);
  item.append(thumb);
  if (tools && organizing) {
    thumb.dataset.drag = '';
    const row = document.createElement('div');
    row.className = 'page-tools';
    row.append(
      pageButton('chevron-up', t('book.moveUp', { number }), 'up', number === 1),
      pageButton('chevron-down', t('book.moveDown', { number }), 'down', number === pages.pages.length),
      pageButton('retake', t('book.retakePage', { number }), 'retake'),
      pageButton('trash', t('book.deletePage', { number }), 'delete'),
    );
    item.append(row);
  }
  return item;
}

/**
 * @param {number} id
 * @param {number} index new 0-based position
 */
function movePage(id, index) {
  const from = pages.numberOf(id);
  pages.move(id, index);
  const to = pages.numberOf(id);
  if (to !== from) announcer.say(t('book.moved', { from, to }), { force: true });
}

/** @param {MouseEvent} event */
function onPageTool(event) {
  const button = /** @type {HTMLElement} */ (event.target).closest?.('[data-page-action]');
  if (!button) return;
  const id = Number(button.closest('li')?.dataset.id);
  const number = pages.numberOf(id);
  if (!number) return;
  const action = button.getAttribute('data-page-action');
  if (action === 'up' || action === 'down') {
    movePage(id, number - 1 + (action === 'up' ? -1 : 1));
    // Keep the focus on the same button of the moved page.
    const item = $('page-list').querySelector(`li[data-id="${id}"]`);
    const same = item?.querySelector(`[data-page-action="${action}"]`);
    (same && !same.disabled ? same : item?.querySelector('[data-page-action]:not(:disabled)'))?.focus();
  } else if (action === 'retake') {
    retakePage(id);
  } else if (action === 'delete') {
    deletePageAsked(id);
  }
}

/** @param {boolean} on */
function setOrganizing(on) {
  organizing = on;
  $('book-organize').setAttribute('aria-pressed', String(on));
  $('page-list').classList.toggle('is-organizing', on);
  renderBook();
}

function renderBook() {
  const list = pages.pages;
  const count = list.length;
  const last = list.at(-1);

  for (const el of document.querySelectorAll('[data-book-title]')) el.textContent = bookTitle() || t('book.untitled');
  screens?.updateTitle();

  // Book screen.
  const cover = $('book-cover');
  if (list[0]) {
    const img = document.createElement('img');
    img.src = list[0].url;
    img.alt = '';
    cover.replaceChildren(img);
  } else {
    cover.replaceChildren(createIcon('book'));
  }
  $('book-meta').textContent = pageCount(count);
  const authorInput = /** @type {HTMLInputElement} */ ($('book-author'));
  if (document.activeElement !== authorInput) authorInput.value = book?.author ?? '';
  // A cover photo replaces the generated cover.
  const coverPhoto = isCover(list[0]?.id);
  $('title-cover-row').hidden = coverPhoto;
  const note = $('cover-note');
  note.hidden = !coverPhoto;
  note.textContent = coverPhoto ? t('book.coverPhoto') : '';
  $('book-organize').hidden = count === 0;
  if (count === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = t('pages.empty');
    $('page-list').replaceChildren(empty);
  } else {
    $('page-list').replaceChildren(...list.map((page) => thumbFor(page, page === last, true)));
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
  screens?.updateTitle();
  const img = $('review-image');
  img.src = page.url;
  img.alt = t('review.image', { number });
  $('review-before').src = page.beforeUrl;
  setStatus($('review-state'), page.detected ? 'review.stateDone' : 'review.stateRetake', {}, page.detected ? 'ok' : 'warning');
  $('review-mirror').setAttribute('aria-pressed', String(page.orientation.mirror));
  $('review-cover').setAttribute('aria-pressed', String(isCover(page.id)));
  renderCorrections(page);
  updateCompare();
  return true;
}

/**
 * One chip-button per correction: pressed when on; turning it off undoes it.
 * @param {Page} page
 */
function renderCorrections(page) {
  const chips = CORRECTIONS.map((name) => {
    const on = page.corrections[name];
    const label = t(`corrections.${name}`);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip-toggle';
    chip.dataset.correction = name;
    chip.dataset.tone = on ? 'ok' : 'info';
    chip.setAttribute('aria-pressed', String(on));
    chip.title = t(on ? 'corrections.undo' : 'corrections.redo', { name: label });
    chip.disabled = correcting;
    const text = document.createElement('span');
    text.textContent = on && !page.applied[name] ? t('corrections.notNeeded', { name: label }) : label;
    chip.append(createIcon(on ? 'check' : 'close'), text);
    return chip;
  });
  $('review-correction-list').replaceChildren(...chips);
  const select = $('review-color');
  fillColorSelect(select, page.corrections.color);
  select.value = page.corrections.color;
  select.disabled = correcting;
}

/** Move the before/after split to the range value. */
function updateCompare() {
  const range = $('review-compare-range');
  const value = Number(range.value);
  $('review-compare').style.setProperty('--split', `${value}%`);
  range.setAttribute('aria-valuetext', t('review.compareValue', { after: 100 - value }));
}

/**
 * Apply the corrections to a straightened page.
 * @param {Blob | ImageData} straight
 * @param {Corrections} corrections
 * @returns {Promise<{ enhanced: Blob, applied: Record<string, boolean> }>}
 */
async function enhance(straight, corrections) {
  const image = straight instanceof Blob ? await blobToImageData(straight) : straight;
  const result = await callOpenCV('enhance', { image, corrections }, [image.data.buffer]);
  return { enhanced: await toJpeg(result.image), applied: result.applied };
}

let correcting = false;

/**
 * Turn corrections on or off (or change the colour mode) and redo the page.
 * @param {Partial<Corrections>} change
 * @param {string} [announce] spoken once done
 */
async function onCorrect(change, announce) {
  const page = pages.get(reviewId);
  if (!page || correcting) return;
  correcting = true;
  const status = $('review-status');
  setStatus(status, 'review.applying');
  renderCorrections(page);
  try {
    const corrections = { ...page.corrections, ...change };
    const { enhanced, applied } = await enhance(page.straight, corrections);
    const image = await orientPage(enhanced, page.orientation);
    correcting = false;
    pages.update(page.id, { corrections, applied, enhanced, image });
    clearStatus(status);
    if (announce) announcer.say(announce, { force: true });
  } catch (error) {
    setStatus(status, 'review.failed', { error: String(error) }, 'error');
  } finally {
    correcting = false;
    const current = pages.get(reviewId);
    if (current) renderCorrections(current);
  }
}

/** @param {MouseEvent} event */
function onCorrectionClick(event) {
  const chip = /** @type {HTMLElement} */ (event.target).closest?.('[data-correction]');
  const page = pages.get(reviewId);
  if (!chip || !page) return;
  const name = /** @type {'dewarp' | 'clean' | 'crop'} */ (chip.getAttribute('data-correction'));
  const on = !page.corrections[name];
  const label = t(`corrections.${name}`);
  onCorrect({ [name]: on }, t(on ? 'corrections.redone' : 'corrections.undone', { name: label }));
}

/** Take this page again: the next capture replaces it. */
const onRetake = () => retakePage(reviewId);

/** @param {number} id */
function retakePage(id) {
  const number = pages.numberOf(id);
  if (!number) return;
  retakeId = id;
  screens.go('capture');
  announcer.say(t('review.retakeHint', { number }), { force: true });
}

/**
 * The straightened image with the page orientation applied.
 * @param {Blob} straight
 * @param {Orientation} orientation
 */
function orientPage(straight, orientation) {
  return orientation.rotation || orientation.mirror ? orientJpeg(straight, orientation) : Promise.resolve(straight);
}

let orienting = false;

/** @param {(orientation: Orientation) => Orientation} change */
async function onOrientPage(change) {
  const page = pages.get(reviewId);
  if (!page || orienting) return;
  orienting = true;
  try {
    const orientation = change(page.orientation);
    const [image, before] = await Promise.all([orientPage(page.enhanced, orientation), orientPage(page.straight, orientation)]);
    pages.update(page.id, { orientation, image, before });
    clearStatus($('review-status'));
  } catch (error) {
    setStatus($('review-status'), 'orientation.failed', { error: String(error) }, 'error');
  } finally {
    orienting = false;
  }
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
    const straight = await toJpeg(result.image);
    const { enhanced, applied } = await enhance(result.image, page.corrections);
    const [oriented, before] = await Promise.all([
      orientPage(enhanced, page.orientation), orientPage(straight, page.orientation),
    ]);
    pages.update(page.id, { quad, straight, enhanced, applied, image: oriented, before });
    clearStatus(status);
  } catch (error) {
    setStatus(status, 'corners.failed', { error: String(error) }, 'error');
  }
}

/**
 * @param {number} id
 * @returns {boolean} true if deleted
 */
function deletePageAsked(id) {
  const number = pages.numberOf(id);
  if (!number || !globalThis.confirm(t('review.confirmDelete', { number }))) return false;
  pages.remove(id);
  announcer.say(t('book.deleted', { number }), { force: true });
  return true;
}

function onDelete() {
  if (deletePageAsked(reviewId)) screens.go('book');
}

/** Mark the reviewed page as the cover photo (it moves first), or unmark it. */
function onCoverToggle() {
  if (!book || !pages.get(reviewId)) return;
  if (isCover(reviewId)) {
    book.coverId = 0;
    announcer.say(t('review.coverUnset'), { force: true });
  } else {
    const number = pages.numberOf(reviewId);
    book.coverId = reviewId;
    pages.move(reviewId, 0);
    announcer.say(t('review.coverSet', { number }), { force: true });
  }
  saveBookRecord();
  renderBook();
  renderReview();
}

function initReview() {
  cornerEditor = new CornerEditor($('corner-dialog'));
  $('review-adjust').addEventListener('click', onAdjust);
  $('review-retake').addEventListener('click', onRetake);
  $('review-correction-list').addEventListener('click', onCorrectionClick);
  $('review-color').addEventListener('change', () => onCorrect({ color: $('review-color').value }));
  $('review-compare-range').addEventListener('input', updateCompare);
  $('review-delete').addEventListener('click', onDelete);
  $('review-cover').addEventListener('click', onCoverToggle);
  $('review-rotate-left').addEventListener('click', () => onOrientPage((o) => rotate(o, -90)));
  $('review-rotate-right').addEventListener('click', () => onOrientPage((o) => rotate(o, 90)));
  $('review-mirror').addEventListener('click', () => onOrientPage(toggleMirror));
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

/**
 * Book title made safe for a file name on every system.
 * @param {string} title
 */
function fileStem(title) {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80);
}

async function onExport() {
  const status = $('export-status');
  const button = $('export-pdf');
  button.disabled = true;
  setStatus(status, 'pages.exporting');
  try {
    const jpegs = await Promise.all(pages.pages.map(async (p) => new Uint8Array(await p.image.arrayBuffer())));
    onAuthorChange(); // a name still being typed counts
    const title = bookTitle() || t('book.untitled');
    const author = book?.author ?? '';
    // Cover: the cover photo (already first), else a generated one if asked.
    let cover = isCover(pages.pages[0]?.id);
    const generated = !cover && getSetting('titleCover', false) === true;
    // Text alternative of each page image, for a page without recognized text.
    const alts = pages.pages.map((p) => (isCover(p.id) ? t('pages.cover') : t('pdf.pageAlt', { number: pages.numberOf(p.id) })));
    const lang = getLanguage(); // the book is assumed to be in the interface language

    // Selectable text: read each page (in Tesseract's own worker).
    /** @type {(import('./export/ocr.js').OcrPage | null)[] | undefined} */
    let text;
    if (getSetting('selectableText', false) === true && Ocr.supports(lang)) {
      const ocr = new Ocr(lang);
      text = [];
      try {
        for (const [i, page] of pages.pages.entries()) {
          setStatus(status, 'pages.recognizing', { number: i + 1, count: pages.pages.length });
          const { width, height } = jpegInfo(jpegs[i]);
          text.push(await ocr.recognize(page.image, width, height));
        }
      } finally {
        await ocr.close();
      }
      setStatus(status, 'pages.exporting');
    }

    if (generated) {
      const { width, height } = jpegInfo(jpegs[0]); // same ratio as the first page
      const scale = 1600 / width;
      jpegs.unshift(await renderCover({ title, author, width: 1600, height: Math.round(height * scale) }));
      text?.unshift(null);
      alts.unshift(author ? `${title}, ${author}` : title);
      cover = true;
    }
    const pdf = buildPdf(jpegs, {
      title,
      author,
      lang,
      coverLabel: cover ? t('pages.cover') : '',
      text,
      alts,
    });
    const date = new Date().toISOString().slice(0, 10);
    download(new Blob([pdf], { type: 'application/pdf' }), `${fileStem(bookTitle()) || 'libreca'}-${date}.pdf`);
    setStatus(status, 'pages.exported', { pages: pageCount(jpegs.length) }, 'ok');
  } catch (error) {
    setStatus(status, 'pages.exportFailed', { error: String(error) }, 'error');
  } finally {
    button.disabled = pages.pages.length === 0;
  }
}

// --- Boot ---------------------------------------------------------------

/**
 * Service worker (sw.js, next to index.html): always the latest files,
 * whatever the server's cache, and the app still opens offline.
 */
function registerServiceWorker() {
  navigator.serviceWorker?.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' })
    .catch(() => {}); // the app works without it
}

async function main() {
  registerServiceWorker();
  applyTheme(getTheme());
  applyIcons(document);
  const lang = getSetting('language', matchLanguage(navigator.languages ?? []));
  await setLanguage(lang);

  pages = new PageList(onPagesChange);
  announcer = new Announcer($('announcer'));
  initLanguageSelect();
  initThemeSelect();
  initCameraSelect();
  initCaptureSettings();
  initSettingsDialog();
  initCapture();
  initReview();
  $('export-pdf').addEventListener('click', onExport);
  $('book-rename').addEventListener('click', onRename);
  $('book-author').addEventListener('change', onAuthorChange);
  initToggle('title-cover-toggle', 'titleCover', false);
  initToggle('selectable-text-toggle', 'selectableText', false);
  $('book-organize').addEventListener('click', () => setOrganizing(!organizing));
  $('page-list').addEventListener('click', onPageTool);
  enableDragReorder($('page-list'), movePage);
  $('library-new').addEventListener('click', () => onNewBook().catch((error) => {
    setStatus($('save-status'), 'library.saveFailed', { error: String(error) }, 'error');
  }));
  $('library-list').addEventListener('click', onLibraryClick);

  screens = new Screens(document, {
    library: { enter: () => { renderLibrary(); } },
    book: {
      enter: (param) => {
        const id = Number(param);
        if (id && id !== book?.id) {
          openBook(id).then((ok) => { if (!ok) screens.go(''); });
          return true;
        }
        return book !== null;
      },
      leave: () => {
        if (organizing) setOrganizing(false);
      },
    },
    capture: {
      enter: () => { ensureBook().then(startCapture); },
      leave: () => {
        stopCapture();
        retakeId = 0;
      },
    },
    page: {
      enter: (param) => {
        reviewId = Number(param);
        return renderReview();
      },
      leave: () => clearStatus($('review-status')),
    },
  }, 'library');

  i18nEvents.addEventListener('change', () => {
    retranslateStatuses();
    fillThemeSelect();
    fillColorSelect($('color-select'), defaultColorMode());
    renderBook();
    if (document.body.dataset.screen === 'library') renderLibrary();
    refreshCameraList().catch(() => {});
  });

  const saved = Number(getSetting('bookId', 0));
  if (saved) await openBook(saved).catch(() => false);
  renderBook();
  screens.route();
  checkSecureContext();
  checkOpenCV();
}

main();
