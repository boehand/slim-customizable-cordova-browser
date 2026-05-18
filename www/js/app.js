/*
 * Slim Browser chrome:
 *   - top address bar with reload, URL input, go, info buttons
 *   - iframe content area
 *   - info modal listing app metadata, installed Cordova plugins, and which
 *     web-platform features (WebNFC, Web Push, getUserMedia) are available.
 */
(function () {
    'use strict';

    const cfg = window.SLIM_BROWSER_CONFIG || {};
    const ui = cfg.ui || {};
    const chrome = ui.chrome || {};
    const githubUrl = chrome.githubUrl || 'https://github.com/boehand/slim-customizable-cordova-browser';

    const $ = (id) => document.getElementById(id);
    const addressBar = $('addressBar');
    const goBtn = $('goBtn');
    const reloadBtn = $('reloadBtn');
    const infoBtn = $('infoBtn');
    const form = $('addressForm');
    const iframe = $('content');
    const fallback = $('fallback');
    const progress = $('progress');
    const modal = $('infoModal');
    const closeInfo = $('closeInfo');

    document.body.style.setProperty('--bg', ui.splashColor || '#0f172a');
    document.body.style.setProperty('--fg', ui.splashTextColor || '#e5e7eb');

    if (chrome.addressBar === false) document.getElementById('addressForm').style.display = 'none';
    if (chrome.infoButton === false) infoBtn.style.display = 'none';

    function normalize(input) {
        const v = (input || '').trim();
        if (!v) return '';
        if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
        if (/^[\w.-]+\.[\w.-]+/.test(v)) return 'https://' + v;
        return 'https://www.google.com/search?q=' + encodeURIComponent(v);
    }

    function navigate(url) {
        if (!url) {
            iframe.removeAttribute('src');
            iframe.hidden = true;
            fallback.hidden = false;
            return;
        }
        fallback.hidden = true;
        iframe.hidden = false;
        progress.hidden = false;
        addressBar.value = url;
        iframe.src = url;
    }

    iframe.addEventListener('load', () => { progress.hidden = true; });
    iframe.addEventListener('error', () => { progress.hidden = true; });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        navigate(normalize(addressBar.value));
    });
    reloadBtn.addEventListener('click', () => {
        if (iframe.src) {
            progress.hidden = false;
            iframe.src = iframe.src;
        }
    });

    addressBar.addEventListener('focus', () => addressBar.select());

    // ──── Info modal ────────────────────────────────────────────────
    function buildPluginList() {
        const list = $('pluginList');
        list.innerHTML = '';
        const plugins = [
            { id: 'cordova-plugin-ibeacon',                    desc: 'iBeacon scanning',     check: () => !!(window.cordova && cordova.plugins && cordova.plugins.locationManager) },
            { id: 'cordova-plugin-background-mode-fixes',      desc: 'Background mode',      check: () => !!(window.cordova && cordova.plugins && cordova.plugins.backgroundMode) },
            { id: 'cordova-plugin-android-permissions',        desc: 'Runtime permissions',  check: () => !!(window.cordova && cordova.plugins && cordova.plugins.permissions) },
            { id: 'darryncampbell-cordova-plugin-intent',      desc: 'Android Intents',      check: () => !!window.intentShim },
            { id: 'cordova-plugin-androidx-adapter',           desc: 'AndroidX adapter',     check: () => !!(window.cordova) },
            { id: 'cordova-plugin-device',                     desc: 'Device info',          check: () => !!(window.device) }
        ];
        for (const p of plugins) {
            let ok = false;
            try { ok = p.check(); } catch (_) {}
            const li = document.createElement('li');
            li.innerHTML = `<span class="${ok ? 'ok' : 'bad'}">${ok ? '●' : '○'}</span> <code>${p.id}</code> — ${p.desc}`;
            list.appendChild(li);
        }
    }

    function buildFeatureList() {
        const list = $('featureList');
        list.innerHTML = '';
        const items = [
            { name: 'WebNFC (NDEFReader)',           ok: 'NDEFReader' in window },
            { name: 'Notifications',                 ok: 'Notification' in window },
            { name: 'Service Worker (push base)',    ok: 'serviceWorker' in navigator },
            { name: 'Push API',                      ok: 'PushManager' in window },
            { name: 'Camera (getUserMedia)',         ok: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) },
            { name: 'Bluetooth (Web Bluetooth)',     ok: 'bluetooth' in navigator },
            { name: 'Geolocation',                   ok: 'geolocation' in navigator },
            { name: 'Clipboard read/write',          ok: !!(navigator.clipboard && navigator.clipboard.readText) }
        ];
        for (const f of items) {
            const li = document.createElement('li');
            li.innerHTML = `<span class="${f.ok ? 'ok' : 'bad'}">${f.ok ? '●' : '○'}</span> ${f.name}`;
            list.appendChild(li);
        }
    }

    function buildAppInfo() {
        const dl = $('appInfo');
        const rows = [
            ['Name',           cfg.appName || 'Slim Browser'],
            ['Configured URL', cfg.url || '(not set)'],
            ['Cordova',        (window.cordova && cordova.version) ? cordova.version : 'unavailable'],
            ['Platform',       (window.cordova && cordova.platformId) ? cordova.platformId : (navigator.platform || 'web')],
            ['User-Agent',     navigator.userAgent]
        ];
        if (window.device) {
            rows.push(['Device',  `${window.device.manufacturer || ''} ${window.device.model || ''}`.trim()]);
            rows.push(['OS',      `${window.device.platform || ''} ${window.device.version || ''}`.trim()]);
        }
        dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }

    function openInfo() {
        $('modalTitle').textContent = cfg.appName || 'Slim Browser';
        $('githubLink').href = githubUrl;
        $('githubLink').textContent = githubUrl;
        buildAppInfo();
        buildPluginList();
        buildFeatureList();
        modal.hidden = false;
    }

    infoBtn.addEventListener('click', openInfo);
    closeInfo.addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
    });

    // ──── Boot ──────────────────────────────────────────────────────
    function boot() {
        const url = (cfg.url && cfg.url !== 'https://your-node-red.example.com/ui') ? cfg.url : '';
        if (url) navigate(url);
        else {
            addressBar.value = cfg.url || '';
            fallback.hidden = false;
            iframe.hidden = true;
        }
    }

    if (window.cordova) document.addEventListener('deviceready', boot, false);
    else boot();
})();
