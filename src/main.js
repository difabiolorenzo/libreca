/**
 * Entry point (v0.1 prototype): settings, environment checks, camera with
 * live page detection, manual capture with perspective correction, manual
 * corner adjustment, simple PDF export.
 */

import { t, setLanguage, getLanguage, matchLanguage, LANGUAGES, i18nEvents } from './i18n/i18n.js';
import { getSetting, setSetting } from './lib/settings.js';
import { loadOpenCV, callOpenCV, OpenCvMissingError } from './lib/opencv.js';
import { grabFrame, imageToJpeg, blobToImageData } from './lib/image.js';
import { isCameraSupported, listCameras, startCamera, stopCamera, cameraErrorKey } from './capture/camera.js';
import { LiveDetector } from './capture/live-detector.js';
import { CornerEditor } from './ui/corner-editor.js';
import { PageList } from './ui/page-list.js';
import { buildPdf } from './export/pdf.js';

/** @typedef {import('./ui/page-list.js').Page} Page */

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

/**
 * Show a translated status. Kept as key + params so it can be re-translated
 * when the language changes.
 * @param {HTMLElement} el
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @param {'ok' | 'error' | ''} [state]
 */
function setStatus(el, key, params = {}, state = '') {
  el.dataset.key = key;
  el.dataset.params = JSON.stringify(params);
  el.dataset.state = state;
  el.textContent = t(key, params);
}

function retranslateStatuses() {
  for (const el of document.querySelectorAll('output[data-key]')) {
    const out = /** @type {HTMLElement} */ (el);
    out.textContent = t(out.dataset.key ?? '', JSON.parse(out.dataset.params || '{}'));
  }
}

// --- Settings: language -------------------------------------------------

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

// --- Camera and live detection -------------------------------------------

/** @type {MediaStream | null} */
let stream = null;

/** @type {LiveDetector} */
let detector;

async function refreshCameraList() {
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

function updateCaptureState() {
  $('capture').disabled = !(stream && opencvReady) || capturing;
  const status = $('scan-status');
  if (stream && !opencvReady) setStatus(status, 'scan.waitOpencv');
  if (opencvReady && status.dataset.key === 'scan.waitOpencv') {
    status.textContent = '';
    delete status.dataset.key;
  }
  if (stream && opencvReady) detector.start();
}

async function onStart() {
  const status = $('camera-status');
  const video = $('camera-preview');
  detector.stop();
  stopCamera(stream);
  setStatus(status, 'camera.starting');
  try {
    stream = await startCamera($('camera-select').value || undefined);
    video.srcObject = stream;
    $('viewer').hidden = false;
    await video.play();
    const { width, height } = stream.getVideoTracks()[0].getSettings();
    setStatus(status, 'camera.running', { width: width ?? '?', height: height ?? '?' }, 'ok');
    $('camera-stop').disabled = false;
    await refreshCameraList(); // labels become available after permission
  } catch (error) {
    stream = null;
    $('viewer').hidden = true;
    setStatus(status, cameraErrorKey(error), { error: String(error) }, 'error');
  }
  updateCaptureState();
}

function onStop() {
  detector.stop();
  stopCamera(stream);
  stream = null;
  $('camera-preview').srcObject = null;
  $('viewer').hidden = true;
  $('camera-stop').disabled = true;
  setStatus($('camera-status'), 'camera.stopped');
  updateCaptureState();
}

function initCamera() {
  const status = $('camera-status');
  detector = new LiveDetector($('camera-preview'), $('page-overlay'),
    async (image) => (await callOpenCV('detect', { image }, [image.data.buffer])).quad);
  if (!window.isSecureContext) {
    setStatus(status, 'camera.insecure', {}, 'error');
    $('camera-start').disabled = true;
    return;
  }
  if (!isCameraSupported()) {
    setStatus(status, 'camera.unsupported', {}, 'error');
    $('camera-start').disabled = true;
    return;
  }
  $('camera-start').addEventListener('click', onStart);
  $('camera-stop').addEventListener('click', onStop);
  $('camera-select').addEventListener('change', () => {
    setSetting('cameraId', $('camera-select').value);
    if (stream) onStart();
  });
  navigator.mediaDevices.addEventListener?.('devicechange', refreshCameraList);
  refreshCameraList().catch(() => {});
}

// --- Capture and pages ------------------------------------------------------

/** @type {PageList} */
let pages;
/** @type {CornerEditor} */
let cornerEditor;
let capturing = false;

/**
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} image
 */
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
    const page = pages.add({ photo: await photo, quad: result.quad, image: await toJpeg(result.image) });
    const number = pages.pages.indexOf(page) + 1;
    setStatus(status, result.detected ? 'scan.captured' : 'scan.noPage', { number }, 'ok');
  } catch (error) {
    setStatus(status, 'scan.failed', { error: String(error) }, 'error');
  } finally {
    capturing = false;
    updateCaptureState();
  }
}

/** @param {Page} page */
async function onAdjust(page) {
  const quad = await cornerEditor.open(page.photo, page.quad);
  if (!quad) return;
  const status = $('scan-status');
  setStatus(status, 'corners.applying');
  try {
    const image = await blobToImageData(page.photo);
    const result = await callOpenCV('warp', { image, quad }, [image.data.buffer]);
    pages.update(page.id, { quad, image: await toJpeg(result.image) });
    status.textContent = '';
    delete status.dataset.key;
  } catch (error) {
    setStatus(status, 'corners.failed', { error: String(error) }, 'error');
  }
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
    setStatus(status, 'pages.exported', { count: jpegs.length }, 'ok');
  } catch (error) {
    setStatus(status, 'pages.exportFailed', { error: String(error) }, 'error');
  } finally {
    button.disabled = pages.pages.length === 0;
  }
}

function initPages() {
  cornerEditor = new CornerEditor($('corner-dialog'));
  pages = new PageList($('page-list'), {
    onAdjust: (page) => { onAdjust(page); },
    onChange: (count) => { $('export-pdf').disabled = count === 0; },
  });
  $('capture').addEventListener('click', onCapture);
  $('export-pdf').addEventListener('click', onExport);
}

// --- Boot ---------------------------------------------------------------

async function main() {
  const lang = getSetting('language', matchLanguage(navigator.languages ?? []));
  await setLanguage(lang);
  i18nEvents.addEventListener('change', () => {
    retranslateStatuses();
    pages.render();
    if (!$('camera-select').disabled) refreshCameraList().catch(() => {});
  });
  initLanguageSelect();
  checkSecureContext();
  initPages();
  initCamera();
  checkOpenCV();
}

main();
