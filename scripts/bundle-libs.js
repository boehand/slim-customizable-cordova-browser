#!/usr/bin/env node
/*
 * Bundles JS dependencies that ship inside the APK from node_modules into
 * www/lib/. Run by `npm run customize` (and therefore before any build) so
 * a fresh checkout produces a self-contained app — no CDN required at
 * runtime, the test page works offline.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'www', 'lib');

const TARGETS = [
    {
        from: 'html5-qrcode/html5-qrcode.min.js',
        to: 'html5-qrcode.min.js'
    }
];

function main() {
    fs.mkdirSync(LIB_DIR, { recursive: true });
    for (const { from, to } of TARGETS) {
        let src;
        try {
            src = require.resolve(from, { paths: [ROOT] });
        } catch (e) {
            console.warn('[bundle-libs] skipped', from, '(run npm install first)');
            continue;
        }
        const dst = path.join(LIB_DIR, to);
        fs.copyFileSync(src, dst);
        console.log('[bundle-libs] copied', path.relative(ROOT, dst));
    }
}

if (require.main === module) {
    try { main(); }
    catch (e) { console.error('[bundle-libs] ERROR:', e.message); process.exit(1); }
}

module.exports = { main };
