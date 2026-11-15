#!/usr/bin/env node
/**
 * Zero-dependency local web server for development.
 *
 *   node tools/serve.mjs                 http://localhost:8080 (this computer only)
 *   node tools/serve.mjs --lan           also reachable from the local network
 *   node tools/serve.mjs --lan --https   HTTPS with .cert/key.pem + .cert/cert.pem
 *   node tools/serve.mjs --port 9000
 *
 * The camera needs a secure context: localhost, or HTTPS on the LAN.
 */

import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.md': 'text/plain; charset=utf-8',
};

function parseArgs(argv) {
  const opts = { port: 8080, lan: false, https: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') opts.port = Number(argv[++i]);
    else if (argv[i] === '--lan') opts.lan = true;
    else if (argv[i] === '--https') opts.https = true;
  }
  return opts;
}

/** Resolve a URL path inside ROOT, or null if it escapes it. */
function toFilePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  // Never serve hidden files or folders (.git, .cert with the HTTPS key...).
  if (decoded.split(/[\\/]/).some((part) => part.startsWith('.'))) return null;
  const file = normalize(join(ROOT, decoded));
  return file === ROOT || file.startsWith(ROOT + sep) ? file : null;
}

async function handle(req, res) {
  let file = toFilePath(req.url ?? '/');
  if (!file) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
  console.log(`${res.statusCode} ${req.method} ${req.url}`);
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

const opts = parseArgs(process.argv.slice(2));
const host = opts.lan ? '0.0.0.0' : '127.0.0.1';
const scheme = opts.https ? 'https' : 'http';

let server;
if (opts.https) {
  try {
    const [key, cert] = await Promise.all([
      readFile(join(ROOT, '.cert', 'key.pem')),
      readFile(join(ROOT, '.cert', 'cert.pem')),
    ]);
    server = createHttps({ key, cert }, handle);
  } catch {
    console.error('Missing .cert/key.pem or .cert/cert.pem (see README, "Démarrer").');
    process.exit(1);
  }
} else {
  server = createHttp(handle);
}

server.listen(opts.port, host, () => {
  console.log(`Libreca: ${scheme}://localhost:${opts.port}/`);
  if (opts.lan) {
    for (const ip of lanAddresses()) console.log(`         ${scheme}://${ip}:${opts.port}/`);
    if (!opts.https) console.log('Note: over plain HTTP on the LAN, browsers block the camera. Use --https.');
  }
});
