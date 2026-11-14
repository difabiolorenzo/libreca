/**
 * Entry point (v0.0): settings with language choice, environment checks
 * (secure context, OpenCV.js) and a camera test.
 */

import { t, setLanguage, getLanguage, matchLanguage, LANGUAGES, i18nEvents } from './i18n/i18n.js';
import { getSetting, setSetting } from './lib/settings.js';
import { loadOpenCV, OpenCvMissingError } from './lib/opencv.js';
import { isCameraSupported, listCameras, startCamera, stopCamera, cameraErrorKey } from './capture/camera.js';

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
  } catch (error) {
    if (error instanceof OpenCvMissingError) {
      setStatus(out, 'diagnostics.missing', {}, 'error');
    } else {
      setStatus(out, 'diagnostics.failed', { error: String(error) }, 'error');
    }
  }
}

// --- Camera test --------------------------------------------------------

/** @type {MediaStream | null} */
let stream = null;

async function refreshCameraList() {
  const select = $('camera-select');
  const previous = select.value;
  const cameras = await listCameras();
  select.replaceChildren(new Option(t('camera.defaultSource'), ''));
  cameras.forEach((cam, i) => {
    select.add(new Option(cam.label || t('camera.unnamed', { index: i + 1 }), cam.deviceId));
  });
  select.value = cameras.some((c) => c.deviceId === previous) ? previous : '';
  select.disabled = false;
}

async function onStart() {
  const status = $('camera-status');
  const video = $('camera-preview');
  stopCamera(stream);
  setStatus(status, 'camera.starting');
  try {
    stream = await startCamera($('camera-select').value || undefined);
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    const { width, height } = stream.getVideoTracks()[0].getSettings();
    setStatus(status, 'camera.running', { width: width ?? '?', height: height ?? '?' }, 'ok');
    $('camera-stop').disabled = false;
    await refreshCameraList(); // labels become available after permission
  } catch (error) {
    stream = null;
    video.hidden = true;
    setStatus(status, cameraErrorKey(error), { error: String(error) }, 'error');
  }
}

function onStop() {
  stopCamera(stream);
  stream = null;
  const video = $('camera-preview');
  video.srcObject = null;
  video.hidden = true;
  $('camera-stop').disabled = true;
  setStatus($('camera-status'), 'camera.stopped');
}

function initCamera() {
  const status = $('camera-status');
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
  $('camera-select').addEventListener('change', () => { if (stream) onStart(); });
  navigator.mediaDevices.addEventListener?.('devicechange', refreshCameraList);
  refreshCameraList().catch(() => {});
}

// --- Boot ---------------------------------------------------------------

async function main() {
  const lang = getSetting('language', matchLanguage(navigator.languages ?? []));
  await setLanguage(lang);
  i18nEvents.addEventListener('change', () => {
    retranslateStatuses();
    if (!$('camera-select').disabled) refreshCameraList().catch(() => {});
  });
  initLanguageSelect();
  checkSecureContext();
  initCamera();
  checkOpenCV();
}

main();
