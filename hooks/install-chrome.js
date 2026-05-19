#!/usr/bin/env node
/*
 * Cordova after_prepare hook — replaces the generated MainActivity.java
 * with a Slim Browser variant that adds a native top bar (reload · URL ·
 * go · info) above the CordovaWebView. The WebView still loads the
 * configured URL directly (no iframe), so cordova.js + plugins behave
 * identically to the default <content src="https://..."> setup.
 *
 * Skipped entirely when customize.json has ui.chrome.enabled === false.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.resolve(__dirname, '..', 'templates-android');
const CUSTOMIZE = path.resolve(__dirname, '..', 'customize.json');

function read(p) { return fs.readFileSync(p, 'utf8'); }

function readCustomize() {
    try { return JSON.parse(read(CUSTOMIZE)); }
    catch (_) { return {}; }
}

function packageIdFromConfig(configXmlPath) {
    const xml = read(configXmlPath);
    const m = xml.match(/<widget[^>]*\sid="([^"]+)"/);
    return m ? m[1] : null;
}

function upsertString(stringsPath, name, value) {
    let xml = fs.existsSync(stringsPath)
        ? read(stringsPath)
        : `<?xml version='1.0' encoding='utf-8'?>\n<resources>\n</resources>\n`;
    const re = new RegExp(`(<string\\s+name="${name}"[^>]*>)[\\s\\S]*?(</string>)`);
    if (re.test(xml)) {
        xml = xml.replace(re, `$1${escapeXml(value)}$2`);
    } else {
        xml = xml.replace(/<\/resources>/, `    <string name="${name}" translatable="false">${escapeXml(value)}</string>\n</resources>`);
    }
    fs.writeFileSync(stringsPath, xml);
}

function escapeXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

module.exports = function (ctx) {
    const rootDir = (ctx && ctx.opts && ctx.opts.projectRoot) || path.resolve(__dirname, '..');
    const customize = readCustomize();
    const chrome = (customize.ui && customize.ui.chrome) || {};
    if (chrome.enabled === false) {
        console.log('[install-chrome] disabled via customize.json → skipping');
        return;
    }

    const androidDir = path.join(rootDir, 'platforms', 'android');
    const appDir = path.join(androidDir, 'app');
    if (!fs.existsSync(appDir)) {
        console.log('[install-chrome] platforms/android/app not present yet → skipping');
        return;
    }

    const packageId = packageIdFromConfig(path.join(rootDir, 'config.xml'));
    if (!packageId) {
        console.error('[install-chrome] could not derive package id from config.xml');
        return;
    }

    // Java source.
    const javaDir = path.join(appDir, 'src', 'main', 'java', ...packageId.split('.'));
    fs.mkdirSync(javaDir, { recursive: true });
    const javaTpl = read(path.join(TEMPLATE_DIR, 'MainActivity.java.template'));
    const javaSrc = javaTpl.replace(/%%PACKAGE%%/g, packageId);
    fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), javaSrc);
    console.log('[install-chrome] wrote MainActivity.java in', path.relative(rootDir, javaDir));

    // Resources.
    const resDir = path.join(appDir, 'src', 'main', 'res');
    const copies = [
        ['res/layout/activity_chrome.xml', path.join(resDir, 'layout', 'activity_chrome.xml')],
        ['res/drawable/url_bar_bg.xml',    path.join(resDir, 'drawable', 'url_bar_bg.xml')]
    ];
    for (const [src, dst] of copies) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(TEMPLATE_DIR, src), dst);
        console.log('[install-chrome] wrote', path.relative(rootDir, dst));
    }

    // Strings (GitHub URL used by the info dialog).
    const githubUrl = chrome.githubUrl || 'https://github.com/boehand/slim-customizable-cordova-browser';
    upsertString(path.join(resDir, 'values', 'strings.xml'), 'slim_github_url', githubUrl);
};

if (require.main === module) {
    module.exports({ opts: { projectRoot: path.resolve(__dirname, '..') } });
}
