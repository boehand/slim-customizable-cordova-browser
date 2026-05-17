#!/usr/bin/env node
/*
 * Copies the Cordova bridge files + slim-browser-client.js into ./dist/cordova-bridge/.
 * Upload that folder to the web server that hosts the page configured as `url`
 * in customize.json, and include the scripts in your page like:
 *
 *   <script src="/cordova-bridge/cordova.js"></script>
 *   <script src="/cordova-bridge/slim-browser-client.js"></script>
 *
 * Run AFTER `cordova prepare android` so the platform assets exist.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'platforms', 'android', 'app', 'src', 'main', 'assets', 'www');
const DST = path.join(ROOT, 'dist', 'cordova-bridge');
const CLIENT = path.join(ROOT, 'examples', 'slim-browser-client.js');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  for (const e of fs.readdirSync(p)) {
    const f = path.join(p, e);
    const s = fs.lstatSync(f);
    if (s.isDirectory()) { rmrf(f); fs.rmdirSync(f); }
    else fs.unlinkSync(f);
  }
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src)) {
    const s = path.join(src, e);
    const d = path.join(dst, e);
    const st = fs.lstatSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function packClient(src, dst, clientPath) {
  if (!fs.existsSync(src)) {
    throw new Error('Cordova assets not found at ' + src + ' — run `npm run prepare:android` first.');
  }
  rmrf(dst);
  fs.mkdirSync(dst, { recursive: true });

  const targets = ['cordova.js', 'cordova_plugins.js'];
  for (const t of targets) {
    const s = path.join(src, t);
    if (!fs.existsSync(s)) {
      throw new Error('missing ' + t + ' in platform assets');
    }
    fs.copyFileSync(s, path.join(dst, t));
  }
  const pluginsDir = path.join(src, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    copyDir(pluginsDir, path.join(dst, 'plugins'));
  }
  if (clientPath && fs.existsSync(clientPath)) {
    fs.copyFileSync(clientPath, path.join(dst, path.basename(clientPath)));
  }
  return dst;
}

function main() {
  const out = packClient(SRC, DST, CLIENT);
  console.log('[pack-client] Wrote', path.relative(ROOT, out));
  console.log('[pack-client] Upload this folder to your web server and reference its files from your page.');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[pack-client]', e.message);
    process.exit(1);
  }
}

module.exports = { packClient };
