/*
 * Slim Browser — local test page.
 * Lets a fresh install exercise every wired-up plugin and Web platform API
 * without any backing web server. Loaded from <content src="start.html">
 * when customize.json has no real URL.
 *
 * Each section follows the same pattern:
 *   const pill = setPill('id', 'ok'|'bad'|'run', label)
 *   const log  = (msg)=>{ document.getElementById(outId).textContent = msg; }
 */

(function () {
    'use strict';
    const cfg = window.SLIM_BROWSER_CONFIG || {};
    const $ = (id) => document.getElementById(id);

    function setPill(id, state, text) {
        const el = $(id);
        if (!el) return;
        el.className = 'pill ' + state;
        el.textContent = text;
    }
    function log(id, msg) {
        const el = $(id);
        if (el) el.textContent = (typeof msg === 'string') ? msg : JSON.stringify(msg, null, 2);
    }
    function append(id, msg) {
        const el = $(id);
        if (!el) return;
        el.textContent = (el.textContent + '\n' + msg).trim();
        el.scrollTop = el.scrollHeight;
    }

    function inCordova() { return !!window.cordova; }
    function bootEnv() {
        const ua = navigator.userAgent;
        const env = inCordova()
            ? `Cordova ${cordova.version || '?'} · ${cordova.platformId || '?'}`
            : 'No Cordova bridge (running in plain browser)';
        const url = cfg.url ? ` · configured URL: ${cfg.url}` : '';
        $('env').textContent = env + url + ' · ' + ua;
    }

    // ── iBeacon ────────────────────────────────────────────────────
    function setupBeacons() {
        const out = 'ib-out';
        const lm = () => (window.cordova && cordova.plugins && cordova.plugins.locationManager);
        if (!lm()) { setPill('ibeacon-pill', 'bad', 'unavailable'); log(out, 'cordova-plugin-ibeacon not present.'); return; }
        setPill('ibeacon-pill', 'ok', 'ready');

        const uuidInput = $('ib-uuid');
        const def = (cfg.beacons && cfg.beacons.regions && cfg.beacons.regions[0]) || {};
        if (def.uuid) uuidInput.value = def.uuid;

        const seen = new Map();
        const delegate = new (lm().Delegate)();
        delegate.didRangeBeaconsInRegion = (pluginResult) => {
            for (const b of (pluginResult.beacons || [])) {
                seen.set(b.uuid + ':' + b.major + ':' + b.minor, b);
            }
            log(out, [...seen.values()].sort((a, b) => b.rssi - a.rssi)
                .map(b => `${b.uuid}  M${b.major} m${b.minor}  ${b.proximity}  RSSI ${b.rssi}  ~${(b.accuracy || 0).toFixed(2)}m`)
                .join('\n') || 'Scanning…');
        };
        delegate.didEnterRegion = (info) => append(out, 'enter ' + info.region.identifier);
        delegate.didExitRegion  = (info) => append(out, 'exit '  + info.region.identifier);
        lm().setDelegate(delegate);

        function region() {
            return new (lm().BeaconRegion)('test-region', uuidInput.value.trim());
        }

        $('ib-auth').onclick = () => {
            lm().requestAlwaysAuthorization().then(() => log(out, 'requestAlwaysAuthorization OK'),
                                                    e => log(out, 'auth error: ' + (e && e.message || e)));
        };
        $('ib-start').onclick = () => {
            seen.clear(); log(out, 'Starting…');
            const r = region();
            lm().startMonitoringForRegion(r)
                .then(() => lm().startRangingBeaconsInRegion(r))
                .then(() => setPill('ibeacon-pill', 'run', 'scanning'))
                .catch(e => log(out, 'start error: ' + (e && e.message || e)));
        };
        $('ib-stop').onclick = () => {
            const r = region();
            Promise.allSettled([
                lm().stopRangingBeaconsInRegion(r),
                lm().stopMonitoringForRegion(r)
            ]).then(() => { setPill('ibeacon-pill', 'ok', 'idle'); append(out, 'stopped'); });
        };
    }

    // ── Background mode ────────────────────────────────────────────
    function setupBackground() {
        const out = 'bg-out';
        const bg = () => (window.cordova && cordova.plugins && cordova.plugins.backgroundMode);
        if (!bg()) { setPill('bg-pill', 'bad', 'unavailable'); log(out, 'plugin not present'); return; }
        setPill('bg-pill', 'ok', 'ready');

        $('bg-enable').onclick = () => {
            bg().setDefaults({ title: cfg.appName || 'Slim Browser', text: 'Test page background mode' });
            bg().enable();
            setPill('bg-pill', 'run', 'enabled');
            log(out, 'enabled');
        };
        $('bg-disable').onclick = () => { bg().disable(); setPill('bg-pill', 'ok', 'idle'); log(out, 'disabled'); };
        $('bg-batt').onclick = () => {
            if (bg().disableBatteryOptimizations) { bg().disableBatteryOptimizations(); log(out, 'requested ignore battery optimizations'); }
            else log(out, 'disableBatteryOptimizations() not supported');
        };
    }

    // ── Intent shim ────────────────────────────────────────────────
    function setupIntent() {
        const out = 'int-out';
        const shim = window.intentShim;
        if (!shim) { setPill('int-pill', 'bad', 'unavailable'); log(out, 'intent shim not present'); return; }
        setPill('int-pill', 'ok', 'ready');

        const intents = {
            geo:   { action: 'android.intent.action.VIEW', url: 'geo:52.520008,13.404954?q=Berlin' },
            tel:   { action: 'android.intent.action.DIAL', url: 'tel:+491701234567' },
            url:   { action: 'android.intent.action.VIEW', url: 'https://github.com/boehand/slim-customizable-cordova-browser' },
            share: { action: 'android.intent.action.SEND', type: 'text/plain', extras: { 'android.intent.extra.TEXT': 'Hello from Slim Browser' } }
        };
        document.querySelectorAll('[data-int]').forEach(b => b.onclick = () => {
            const i = intents[b.dataset.int];
            shim.startActivity(i, () => log(out, 'sent: ' + JSON.stringify(i)),
                                  e => log(out, 'error: ' + JSON.stringify(e)));
        });
    }

    // ── Runtime permissions ────────────────────────────────────────
    function setupPermissions() {
        const list = $('perm-list');
        const perms = window.cordova && cordova.plugins && cordova.plugins.permissions;
        if (!perms) { setPill('perm-pill', 'bad', 'unavailable'); list.innerHTML = '<li>plugin not present</li>'; return; }
        setPill('perm-pill', 'ok', 'ready');
        const wanted = [
            ['ACCESS_FINE_LOCATION', 'Fine location'],
            ['ACCESS_COARSE_LOCATION', 'Coarse location'],
            ['ACCESS_BACKGROUND_LOCATION', 'Background location'],
            ['BLUETOOTH_SCAN', 'Bluetooth scan'],
            ['BLUETOOTH_CONNECT', 'Bluetooth connect'],
            ['CAMERA', 'Camera'],
            ['POST_NOTIFICATIONS', 'Notifications']
        ];
        list.innerHTML = '';
        for (const [name, label] of wanted) {
            const li = document.createElement('li');
            const code = perms[name];
            li.innerHTML = `<span class="dot"></span><code>${name}</code> <span class="muted">${label}</span> <button>Request</button>`;
            const btn = li.querySelector('button');
            const dot = li.querySelector('.dot');
            const refresh = () => perms.checkPermission(code, (r) => dot.className = 'dot ' + (r.hasPermission ? 'ok' : 'bad'), () => dot.className = 'dot bad');
            refresh();
            btn.onclick = () => perms.requestPermission(code, refresh, () => dot.className = 'dot bad');
            list.appendChild(li);
        }
    }

    // ── Device info ────────────────────────────────────────────────
    function setupDevice() {
        if (!window.device) { setPill('dev-pill', 'bad', 'unavailable'); log('dev-out', 'cordova-plugin-device not present'); return; }
        setPill('dev-pill', 'ok', 'ready');
        log('dev-out', {
            model: device.model,
            manufacturer: device.manufacturer,
            platform: device.platform,
            version: device.version,
            uuid: device.uuid,
            serial: device.serial,
            cordova: device.cordova,
            sdkVersion: device.sdkVersion,
            isVirtual: device.isVirtual
        });
    }

    // ── WebNFC ─────────────────────────────────────────────────────
    function setupNfc() {
        const out = 'nfc-out';
        if (!('NDEFReader' in window)) { setPill('nfc-pill', 'bad', 'unsupported'); log(out, 'NDEFReader not available'); return; }
        setPill('nfc-pill', 'ok', 'ready');
        $('nfc-scan').onclick = async () => {
            try {
                const reader = new NDEFReader();
                await reader.scan();
                log(out, 'Scanning… tap a tag.');
                setPill('nfc-pill', 'run', 'scanning');
                reader.onreading = (e) => {
                    let lines = ['--- ' + (e.serialNumber || '') + ' ---'];
                    for (const r of e.message.records) {
                        let val = '';
                        if (r.data) { try { val = new TextDecoder(r.encoding || 'utf-8').decode(r.data); } catch (_) {} }
                        lines.push(r.recordType + ': ' + val);
                    }
                    append(out, lines.join('\n'));
                };
                reader.onreadingerror = () => append(out, 'read error');
            } catch (e) { log(out, 'error: ' + e.message); setPill('nfc-pill', 'bad', 'denied'); }
        };
        $('nfc-clear').onclick = () => log(out, '');
    }

    // ── Notifications ──────────────────────────────────────────────
    function setupNotifications() {
        const out = 'not-out';
        if (!('Notification' in window)) { setPill('not-pill', 'bad', 'unsupported'); return; }
        setPill('not-pill', Notification.permission === 'granted' ? 'ok' : 'run', Notification.permission);
        log(out, 'permission: ' + Notification.permission);
        $('not-req').onclick = async () => {
            const p = await Notification.requestPermission();
            setPill('not-pill', p === 'granted' ? 'ok' : 'bad', p);
            log(out, 'permission: ' + p);
        };
        $('not-show').onclick = () => {
            try { new Notification(cfg.appName || 'Slim Browser', { body: 'Hello from the test page.' }); log(out, 'shown'); }
            catch (e) { log(out, 'error: ' + e.message); }
        };
    }

    // ── Web Push / Service Worker ─────────────────────────────────
    async function setupPush() {
        const out = 'push-out';
        const ok = ('serviceWorker' in navigator) && ('PushManager' in window);
        setPill('push-pill', ok ? 'ok' : 'bad', ok ? 'available' : 'unsupported');
        if (!ok) { log(out, 'serviceWorker or PushManager missing'); return; }
        $('push-reg').onclick = async () => {
            try {
                const swCode = `self.addEventListener('push', e => self.registration.showNotification('Push', { body: e.data ? e.data.text() : '(no body)' }));`;
                const swUrl = URL.createObjectURL(new Blob([swCode], { type: 'application/javascript' }));
                const reg = await navigator.serviceWorker.register(swUrl, { scope: './' });
                let pushReady = false;
                try {
                    const sub = await reg.pushManager.getSubscription();
                    pushReady = !!sub || true;
                } catch (e) {}
                log(out, {
                    swRegistered: true,
                    scope: reg.scope,
                    pushManagerAvailable: !!reg.pushManager,
                    note: 'Real push needs a VAPID-enabled server.'
                });
            } catch (e) { log(out, 'register failed: ' + e.message); }
        };
        $('push-unsub').onclick = async () => {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
            log(out, 'unregistered ' + regs.length + ' SWs');
        };
    }

    // ── Camera ─────────────────────────────────────────────────────
    function setupCamera() {
        const out = 'cam-out';
        const video = $('cam-video');
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setPill('cam-pill', 'bad', 'unsupported'); return; }
        setPill('cam-pill', 'ok', 'ready');
        let stream = null;
        $('cam-start').onclick = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                video.srcObject = stream;
                video.classList.add('on');
                await video.play();
                setPill('cam-pill', 'run', 'live');
                const tracks = stream.getVideoTracks().map(t => `${t.label} ${JSON.stringify(t.getSettings())}`);
                log(out, tracks.join('\n'));
            } catch (e) { log(out, 'error: ' + e.message); setPill('cam-pill', 'bad', 'denied'); }
        };
        $('cam-stop').onclick = () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
            stream = null; video.classList.remove('on'); video.srcObject = null;
            setPill('cam-pill', 'ok', 'idle'); log(out, 'stopped');
        };
    }

    // ── QR ─────────────────────────────────────────────────────────
    function setupQr() {
        const out = 'qr-out';
        const host = $('qr-host');
        const hasDetector = 'BarcodeDetector' in window;
        setPill('qr-pill', 'ok', hasDetector ? 'BarcodeDetector' : 'CDN fallback');

        let stop = null;
        async function startNative() {
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            const video = document.createElement('video');
            video.playsInline = true; video.muted = true;
            host.innerHTML = ''; host.appendChild(video);
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = stream; await video.play();
            let running = true;
            (async function loop() {
                while (running) {
                    try {
                        const codes = await detector.detect(video);
                        if (codes.length) { log(out, codes.map(c => c.rawValue).join('\n')); break; }
                    } catch (_) {}
                    await new Promise(r => setTimeout(r, 250));
                }
                stream.getTracks().forEach(t => t.stop());
            })();
            stop = () => { running = false; };
        }
        function startLib() {
            host.innerHTML = '<div id="qr-reader"></div>';
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
            s.onload = () => {
                const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: 250 }, false);
                scanner.render(t => log(out, t), () => {});
                stop = () => scanner.clear().catch(() => {});
            };
            s.onerror = () => log(out, 'html5-qrcode CDN unavailable and no native BarcodeDetector — connect to internet or implement a local lib.');
            document.head.appendChild(s);
        }
        $('qr-start').onclick = () => {
            log(out, 'Starting…');
            if (hasDetector) startNative().catch(e => log(out, 'error: ' + e.message));
            else startLib();
        };
        $('qr-stop').onclick = () => { if (stop) stop(); host.innerHTML = ''; log(out, 'stopped'); };
    }

    // ── Web Bluetooth ─────────────────────────────────────────────
    function setupBle() {
        const out = 'ble-out';
        if (!navigator.bluetooth) { setPill('ble-pill', 'bad', 'unsupported'); log(out, 'navigator.bluetooth missing'); return; }
        setPill('ble-pill', 'ok', 'ready');
        $('ble-scan').onclick = async () => {
            try {
                const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
                log(out, { id: dev.id, name: dev.name });
            } catch (e) { log(out, 'error: ' + e.message); }
        };
    }

    // ── Geolocation ───────────────────────────────────────────────
    function setupGeo() {
        const out = 'geo-out';
        if (!navigator.geolocation) { setPill('geo-pill', 'bad', 'unsupported'); return; }
        setPill('geo-pill', 'ok', 'ready');
        let watchId = null;
        const pretty = (pos) => `lat ${pos.coords.latitude}\nlng ${pos.coords.longitude}\n±${pos.coords.accuracy}m  alt ${pos.coords.altitude || '?'}\nspeed ${pos.coords.speed || '?'}`;
        $('geo-once').onclick = () => navigator.geolocation.getCurrentPosition(p => log(out, pretty(p)), e => log(out, 'error: ' + e.message));
        $('geo-watch').onclick = () => {
            if (watchId !== null) return;
            watchId = navigator.geolocation.watchPosition(p => log(out, pretty(p) + '\n(watching #' + watchId + ')'), e => log(out, 'error: ' + e.message));
            setPill('geo-pill', 'run', 'watching');
        };
        $('geo-stop').onclick = () => {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            watchId = null; setPill('geo-pill', 'ok', 'idle'); append(out, 'stopped');
        };
    }

    // ── Vibrate ───────────────────────────────────────────────────
    function setupVibrate() {
        const out = 'vib-out';
        if (!navigator.vibrate) { setPill('vib-pill', 'bad', 'unsupported'); return; }
        setPill('vib-pill', 'ok', 'ready');
        $('vib-short').onclick   = () => { navigator.vibrate(80);  log(out, 'short'); };
        $('vib-long').onclick    = () => { navigator.vibrate(600); log(out, 'long'); };
        $('vib-pattern').onclick = () => { navigator.vibrate([100, 60, 100, 60, 300]); log(out, 'pattern'); };
    }

    // ── Clipboard ─────────────────────────────────────────────────
    function setupClipboard() {
        const out = 'clip-out';
        if (!(navigator.clipboard && navigator.clipboard.writeText)) { setPill('clip-pill', 'bad', 'unsupported'); return; }
        setPill('clip-pill', 'ok', 'ready');
        $('clip-write').onclick = async () => {
            try { await navigator.clipboard.writeText($('clip-in').value); log(out, 'wrote: ' + $('clip-in').value); }
            catch (e) { log(out, 'write error: ' + e.message); }
        };
        $('clip-read').onclick = async () => {
            try { log(out, 'read: ' + await navigator.clipboard.readText()); }
            catch (e) { log(out, 'read error: ' + e.message); }
        };
    }

    // ── Device Motion / Orientation ───────────────────────────────
    function setupMotion() {
        const out = 'mot-out';
        const hasMotion = 'DeviceMotionEvent' in window;
        const hasOrient = 'DeviceOrientationEvent' in window;
        if (!hasMotion && !hasOrient) { setPill('mot-pill', 'bad', 'unsupported'); return; }
        setPill('mot-pill', 'ok', 'ready');
        let onMotion = null, onOrient = null;
        $('mot-start').onclick = async () => {
            // iOS requires explicit permission; Android does not.
            if (DeviceMotionEvent.requestPermission) {
                try { await DeviceMotionEvent.requestPermission(); } catch (_) {}
            }
            const state = { motion: null, orientation: null };
            const render = () => log(out, JSON.stringify(state, null, 2));
            onMotion = (e) => {
                state.motion = {
                    accel: e.acceleration && { x: round(e.acceleration.x), y: round(e.acceleration.y), z: round(e.acceleration.z) },
                    rot: e.rotationRate && { a: round(e.rotationRate.alpha), b: round(e.rotationRate.beta), g: round(e.rotationRate.gamma) }
                };
                render();
            };
            onOrient = (e) => { state.orientation = { a: round(e.alpha), b: round(e.beta), g: round(e.gamma) }; render(); };
            if (hasMotion) window.addEventListener('devicemotion', onMotion);
            if (hasOrient) window.addEventListener('deviceorientation', onOrient);
            setPill('mot-pill', 'run', 'streaming');
        };
        $('mot-stop').onclick = () => {
            if (onMotion) window.removeEventListener('devicemotion', onMotion);
            if (onOrient) window.removeEventListener('deviceorientation', onOrient);
            setPill('mot-pill', 'ok', 'idle');
        };
        function round(n) { return n == null ? null : Math.round(n * 100) / 100; }
    }

    // ── Bootstrap ─────────────────────────────────────────────────
    function boot() {
        bootEnv();
        setupBeacons();
        setupBackground();
        setupIntent();
        setupPermissions();
        setupDevice();
        setupNfc();
        setupNotifications();
        setupPush();
        setupCamera();
        setupQr();
        setupBle();
        setupGeo();
        setupVibrate();
        setupClipboard();
        setupMotion();
    }

    if (inCordova()) document.addEventListener('deviceready', boot, false);
    else boot();
})();
