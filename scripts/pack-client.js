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

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[pack-client] Cordova assets not found at', SRC);
    console.error('[pack-client] Run `npm run prepare:android` first.');
    process.exit(1);
  }
  rmrf(DST);
  fs.mkdirSync(DST, { recursive: true });

  const targets = ['cordova.js', 'cordova_plugins.js'];
  for (const t of targets) {
    const s = path.join(SRC, t);
    if (!fs.existsSync(s)) {
      console.error('[pack-client] missing', t, 'in platform assets');
      process.exit(1);
    }
    fs.copyFileSync(s, path.join(DST, t));
  }
  const pluginsDir = path.join(SRC, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    copyDir(pluginsDir, path.join(DST, 'plugins'));
  }
  fs.copyFileSync(CLIENT, path.join(DST, 'slim-browser-client.js'));

  console.log('[pack-client] Wrote', path.relative(ROOT, DST));
  console.log('[pack-client] Upload this folder to your web server and reference its files from your page.');
}

main();
