/**
 * Camera access: list video sources, start and stop a stream.
 * getUserMedia only works in a secure context (HTTPS or localhost).
 */

/** @returns {boolean} */
export function isCameraSupported() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
}

/**
 * List video inputs. Labels are empty until camera permission is granted.
 * @returns {Promise<MediaDeviceInfo[]>}
 */
export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

/**
 * Open a camera. Without deviceId, prefer the back camera (phones).
 * @param {string} [deviceId]
 * @returns {Promise<MediaStream>}
 */
export function startCamera(deviceId) {
  /** @type {MediaTrackConstraints} */
  const video = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    ...(deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: 'environment' } }),
  };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

/** @param {MediaStream | null} stream */
export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Map a getUserMedia error to a translation key.
 * @param {unknown} error
 * @returns {string}
 */
export function cameraErrorKey(error) {
  const name = /** @type {{ name?: string }} */ (error)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'camera.denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'camera.notFound';
    case 'NotReadableError':
      return 'camera.busy';
    default:
      return 'camera.error';
  }
}
