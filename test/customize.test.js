const test = require('node:test');
const assert = require('node:assert/strict');
const {
    escapeXml,
    buildAllowList,
    buildConfigXml,
    buildClientConfig
} = require('../scripts/customize');

const baseCfg = () => ({
    appId: 'com.test.app',
    appName: 'TestApp',
    version: '1.2.3',
    description: 'Some description',
    url: 'https://example.com/ui',
    author: { name: 'Alice', email: 'a@b.c', url: 'https://a.b' },
    ui: { splashColor: '#101010' },
    android: { minSdkVersion: 24, targetSdkVersion: 33, allowMixedContent: false },
    beacons: { regions: [{ identifier: 'r1', uuid: 'UUID-1' }] },
    navigation: { allowedOrigins: ['https://other.test/*'] }
});

test('escapeXml handles every special char', () => {
    assert.equal(escapeXml('<a & b "c" \'d\'>'), '&lt;a &amp; b &quot;c&quot; &apos;d&apos;&gt;');
});

test('buildAllowList includes URL origin + extra origins, deduped', () => {
    const out = buildAllowList({
        url: 'https://example.com/ui/foo',
        navigation: { allowedOrigins: ['https://example.com/*', 'http://1.2.3.4/*'] }
    });
    const lines = out.split('\n').filter(Boolean);
    assert.equal(lines.length, 2, 'duplicates should be removed');
    assert.ok(out.includes('https://example.com/*'));
    assert.ok(out.includes('http://1.2.3.4/*'));
});

test('buildAllowList tolerates missing/invalid URL', () => {
    assert.equal(buildAllowList({}), '');
    const out = buildAllowList({ url: 'not a url', navigation: { allowedOrigins: ['https://x/*'] } });
    assert.ok(out.includes('https://x/*'));
});

test('buildConfigXml wires identifying fields', () => {
    const xml = buildConfigXml(baseCfg());
    assert.match(xml, /id="com\.test\.app"/);
    assert.match(xml, /version="1\.2\.3"/);
    assert.match(xml, /<name>TestApp<\/name>/);
    assert.match(xml, /<description>Some description<\/description>/);
    assert.match(xml, /<author email="a@b\.c" href="https:\/\/a\.b">Alice<\/author>/);
});

test('buildConfigXml uses the remote URL as <content src> when present', () => {
    const xml = buildConfigXml(baseCfg());
    assert.match(xml, /<content src="https:\/\/example\.com\/ui" \/>/);
});

test('buildConfigXml falls back to index.html when no url configured', () => {
    const cfg = baseCfg(); delete cfg.url;
    const xml = buildConfigXml(cfg);
    assert.match(xml, /<content src="index\.html" \/>/);
});

test('buildConfigXml emits all required Android permissions', () => {
    const xml = buildConfigXml(baseCfg());
    const needed = [
        'BLUETOOTH', 'BLUETOOTH_ADMIN', 'BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT',
        'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'WAKE_LOCK',
        'RECEIVE_BOOT_COMPLETED', 'CAMERA', 'NFC', 'VIBRATE'
    ];
    for (const p of needed) {
        assert.match(xml, new RegExp(`android\\.permission\\.${p}`), `missing permission ${p}`);
    }
});

test('buildConfigXml honours custom Android SDK versions', () => {
    const xml = buildConfigXml(baseCfg());
    assert.match(xml, /android-minSdkVersion" value="24"/);
    assert.match(xml, /android-targetSdkVersion" value="33"/);
});

test('buildConfigXml escapes user-supplied values', () => {
    const cfg = baseCfg();
    cfg.appName = 'Foo & "Bar"';
    cfg.description = '<script>alert(1)</script>';
    const xml = buildConfigXml(cfg);
    assert.match(xml, /<name>Foo &amp; &quot;Bar&quot;<\/name>/);
    assert.match(xml, /<description>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/description>/);
    assert.ok(!xml.includes('<script>alert(1)</script>'));
});

test('buildConfigXml sets MixedContentMode based on allowMixedContent', () => {
    const a = buildConfigXml({ ...baseCfg(), android: { allowMixedContent: true } });
    assert.match(a, /MixedContentMode" value="0"/);
    const b = buildConfigXml({ ...baseCfg(), android: { allowMixedContent: false } });
    assert.match(b, /MixedContentMode" value="1"/);
});

test('buildClientConfig produces a valid JS module assigning the config', () => {
    const cfg = baseCfg();
    const js = buildClientConfig(cfg);
    assert.match(js, /^\/\* AUTO-GENERATED/);
    assert.match(js, /window\.SLIM_BROWSER_CONFIG = /);
    const sandbox = { window: {} };
    const fn = new Function('window', js);
    fn(sandbox.window);
    assert.equal(sandbox.window.SLIM_BROWSER_CONFIG.url, cfg.url);
    assert.equal(sandbox.window.SLIM_BROWSER_CONFIG.appName, cfg.appName);
    assert.deepEqual(sandbox.window.SLIM_BROWSER_CONFIG.beacons.regions, cfg.beacons.regions);
});

test('buildClientConfig defaults beacons.regions when not provided', () => {
    const js = buildClientConfig({ url: 'https://x', appName: 'X' });
    const sandbox = { window: {} };
    new Function('window', js)(sandbox.window);
    assert.deepEqual(sandbox.window.SLIM_BROWSER_CONFIG.beacons, { regions: [] });
});
