const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { packClient } = require('../scripts/pack-client');

const ROOT = path.resolve(__dirname, '..');
const CUSTOMIZE_BIN = path.join(ROOT, 'scripts', 'customize.js');
const CONFIG_XML = path.join(ROOT, 'config.xml');
const CLIENT_CFG = path.join(ROOT, 'www', 'js', 'config.js');

function runCustomize() {
    const r = spawnSync(process.execPath, [CUSTOMIZE_BIN], { cwd: ROOT });
    assert.equal(r.status, 0, 'customize exited non-zero: ' + r.stderr.toString());
}

test('customize CLI writes config.xml and www/js/config.js', () => {
    runCustomize();
    assert.ok(fs.existsSync(CONFIG_XML), 'config.xml missing');
    assert.ok(fs.existsSync(CLIENT_CFG), 'www/js/config.js missing');
});

test('generated config.xml has balanced XML tags', () => {
    runCustomize();
    const xml = fs.readFileSync(CONFIG_XML, 'utf8');
    const openings = (xml.match(/<[a-zA-Z][^>]*[^/]>/g) || []).filter(t => !t.startsWith('<?')).length;
    const closings = (xml.match(/<\/[^>]+>/g) || []).length;
    assert.equal(openings, closings, `open=${openings} close=${closings}`);
    assert.ok(xml.includes('<widget '));
    assert.ok(xml.includes('</widget>'));
});

test('generated client config self-loads into window.SLIM_BROWSER_CONFIG', () => {
    runCustomize();
    const src = fs.readFileSync(CLIENT_CFG, 'utf8');
    const sandbox = { window: {} };
    new Function('window', src)(sandbox.window);
    assert.equal(typeof sandbox.window.SLIM_BROWSER_CONFIG, 'object');
    assert.equal(typeof sandbox.window.SLIM_BROWSER_CONFIG.appName, 'string');
    assert.equal(typeof sandbox.window.SLIM_BROWSER_CONFIG.url, 'string');
    assert.equal(sandbox.window.SLIM_BROWSER_CONFIG.appId, undefined,
        'appId should not be exposed to the client config');
});

test('packClient copies cordova.js + plugins from a fixture', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-pack-'));
    const src = path.join(tmp, 'src');
    const dst = path.join(tmp, 'dst');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'cordova.js'), '/* cordova */');
    fs.writeFileSync(path.join(src, 'cordova_plugins.js'), 'module.exports.metadata={};');
    fs.mkdirSync(path.join(src, 'plugins', 'fake-plugin', 'www'), { recursive: true });
    fs.writeFileSync(path.join(src, 'plugins', 'fake-plugin', 'www', 'a.js'), '// fake');
    const client = path.join(tmp, 'slim-browser-client.js');
    fs.writeFileSync(client, '// client');

    packClient(src, dst, client);

    assert.ok(fs.existsSync(path.join(dst, 'cordova.js')));
    assert.ok(fs.existsSync(path.join(dst, 'cordova_plugins.js')));
    assert.ok(fs.existsSync(path.join(dst, 'plugins', 'fake-plugin', 'www', 'a.js')));
    assert.ok(fs.existsSync(path.join(dst, 'slim-browser-client.js')));

    fs.rmSync(tmp, { recursive: true, force: true });
});

test('packClient throws when source is missing', () => {
    assert.throws(
        () => packClient(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()), '/tmp/x'),
        /Cordova assets not found/
    );
});

test('packClient throws when cordova.js missing in source', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-pack-'));
    const src = path.join(tmp, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'unrelated.txt'), '');
    assert.throws(() => packClient(src, path.join(tmp, 'dst')), /missing cordova\.js/);
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('client uses correct Cordova plugin namespaces', () => {
    const src = fs.readFileSync(path.join(ROOT, 'examples', 'slim-browser-client.js'), 'utf8');
    // iBeacon plugin merges into cordova.plugins → locationManager
    assert.match(src, /\.plugins\.locationManager/);
    // background-mode-fixes clobbers cordova.plugins.backgroundMode
    assert.match(src, /\.plugins\.backgroundMode/);
    // darryncampbell intent shim clobbers window.intentShim (not plugins.intentShim)
    assert.match(src, /global\.intentShim/);
    assert.doesNotMatch(src, /plugins\.intentShim/);
});
