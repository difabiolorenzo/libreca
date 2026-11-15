// Service worker (sw.js) run in a fake worker scope: fresh files online,
// kept copies offline, other sites left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://example.test';

/** Load sw.js with a fake network; returns a function playing one fetch event. */
function loadWorker() {
  const store = new Map();
  const net = { online: true, version: 'v1', calls: /** @type {any[]} */ ([]) };
  /** @type {Record<string, Function>} */
  const listeners = {};
  const cache = {
    put: async (/** @type {Request} */ req, /** @type {Response} */ res) => { store.set(req.url, await res.text()); },
    match: async (/** @type {Request} */ req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
  };
  const self = {
    location: new URL(`${ORIGIN}/libreca/sw.js`),
    addEventListener: (/** @type {string} */ type, /** @type {Function} */ fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const fetch = async (/** @type {Request} */ req, /** @type {any} */ init) => {
    net.calls.push({ url: req.url, cache: init?.cache });
    if (!net.online) throw new TypeError('offline');
    const res = new Response(`${req.url} ${net.version}`);
    Object.defineProperty(res, 'type', { value: 'basic' });
    return res;
  };
  vm.runInNewContext(code, { self, caches: { open: async () => cache }, fetch, URL, Response });
  /** @param {string} url @param {string} [method] */
  const play = async (url, method = 'GET') => {
    /** @type {Promise<Response> | null} */
    let answer = null;
    listeners.fetch({ request: new Request(url, { method }), respondWith: (/** @type {any} */ p) => { answer = p; } });
    return answer ? (await answer).text() : null;
  };
  return { play, net };
}

test('online: always asks the server again, bypassing its cache', async () => {
  const { play, net } = loadWorker();
  assert.equal(await play(`${ORIGIN}/libreca/src/main.js`), `${ORIGIN}/libreca/src/main.js v1`);
  net.version = 'v2';
  assert.equal(await play(`${ORIGIN}/libreca/src/main.js`), `${ORIGIN}/libreca/src/main.js v2`);
  assert.ok(net.calls.every((c) => c.cache === 'no-cache'));
});

test('offline: serves the last copy received', async () => {
  const { play, net } = loadWorker();
  await play(`${ORIGIN}/libreca/src/lib/opencv-worker.js`);
  net.online = false;
  assert.equal(await play(`${ORIGIN}/libreca/src/lib/opencv-worker.js`), `${ORIGIN}/libreca/src/lib/opencv-worker.js v1`);
  await assert.rejects(play(`${ORIGIN}/libreca/never-seen.js`));
});

test('other sites and non-GET requests are not touched', async () => {
  const { play } = loadWorker();
  assert.equal(await play('https://elsewhere.test/a.js'), null);
  assert.equal(await play(`${ORIGIN}/libreca/x`, 'POST'), null);
});
