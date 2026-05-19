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

    // ── Bottom log panel ───────────────────────────────────────────
    // Captures console.* + window errors, plus explicit logEvent() calls
    // from individual sections, into the collapsible bottom panel.
    const LOG_MAX = 500;
    const logBuf = [];
    let logCount = 0;
    function fmtArg(a) {
        if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (_) { return String(a); }
    }
    function logEvent(level, ...args) {
        const ts = new Date().toISOString().slice(11, 19);
        const msg = args.map(fmtArg).join(' ');
        logBuf.push({ ts, level, msg });
        if (logBuf.length > LOG_MAX) logBuf.splice(0, logBuf.length - LOG_MAX);
        logCount++;
        renderLog();
    }
    function renderLog() {
        const out = $('log-out');
        const cnt = $('log-count');
        if (cnt) cnt.textContent = String(logCount);
        if (!out) return;
        out.innerHTML = logBuf.map(e =>
            `<span class="lvl-${e.level}">[${e.ts}] ${e.level.toUpperCase()} ${escapeHtml(e.msg)}</span>`
        ).join('\n');
        const auto = $('log-autoscroll');
        if (!auto || auto.checked) out.scrollTop = out.scrollHeight;
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
    function setupLogPanel() {
        ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
            const orig = console[level] && console[level].bind(console);
            console[level] = (...args) => {
                logEvent(level === 'log' ? 'info' : level, ...args);
                if (orig) orig(...args);
            };
        });
        window.addEventListener('error', (e) => {
            logEvent('error', (e.message || 'error') + (e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''));
        });
        window.addEventListener('unhandledrejection', (e) => {
            logEvent('error', 'unhandledrejection: ' + fmtArg(e.reason));
        });
        const clear = $('log-clear');
        if (clear) clear.onclick = () => { logBuf.length = 0; logCount = 0; renderLog(); };
        const copy = $('log-copy');
        if (copy) copy.onclick = async () => {
            const text = logBuf.map(e => `[${e.ts}] ${e.level.toUpperCase()} ${e.msg}`).join('\n');
            try { await navigator.clipboard.writeText(text); }
            catch (_) { /* clipboard may be blocked */ }
        };
    }

    // Request a single runtime permission via cordova-plugin-android-permissions.
    function requestRuntimePermission(name) {
        return new Promise((resolve) => {
            const perms = window.cordova && cordova.plugins && cordova.plugins.permissions;
            if (!perms || !perms[name]) return resolve(false);
            perms.checkPermission(perms[name], (r) => {
                if (r.hasPermission) return resolve(true);
                perms.requestPermission(perms[name],
                    (r2) => resolve(!!r2.hasPermission),
                    () => resolve(false));
            }, () => resolve(false));
        });
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

        $('bg-enable').onclick = async () => {
            // Android 13+ needs POST_NOTIFICATIONS to show the foreground
            // service notification the plugin relies on.
            const granted = await requestRuntimePermission('POST_NOTIFICATIONS');
            if (!granted) logEvent('warn', 'background-mode: POST_NOTIFICATIONS not granted — foreground notification may not appear');
            bg().setDefaults({ title: cfg.appName || 'Slim Browser', text: 'Test page background mode' });
            bg().enable();
            setPill('bg-pill', 'run', 'enabled');
            log(out, 'enabled (notification perm: ' + (granted ? 'granted' : 'missing') + ')');
            logEvent('info', 'background-mode enabled');
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
        if (!('NDEFReader' in window)) {
            setPill('nfc-pill', 'bad', 'unsupported');
            log(out, 'NDEFReader not available. The Android System WebView only exposes WebNFC when it is up-to-date (Chrome 89+).');
            return;
        }
        setPill('nfc-pill', 'ok', 'ready');
        $('nfc-scan').onclick = async () => {
            try {
                // Check Permissions API first so we can give a precise hint.
                if (navigator.permissions && navigator.permissions.query) {
                    try {
                        const st = await navigator.permissions.query({ name: 'nfc' });
                        logEvent('info', 'NFC permission state: ' + st.state);
                        if (st.state === 'denied') {
                            log(out, 'NFC permission denied. Open App-Settings → Permissions and allow Nearby Devices / NFC, then retry.');
                            setPill('nfc-pill', 'bad', 'denied');
                            return;
                        }
                    } catch (_) { /* not all WebViews implement the nfc permission name */ }
                }
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
                    logEvent('info', 'NFC read: ' + (e.serialNumber || '(no serial)'));
                };
                reader.onreadingerror = () => { append(out, 'read error'); logEvent('warn', 'NFC read error'); };
            } catch (e) {
                const msg = e && e.message || String(e);
                let hint = '';
                if (/NotAllowed/i.test(msg) || /denied/i.test(msg)) hint = '\nGrant NFC in App-Settings or accept the system prompt next time.';
                else if (/NotSupported/i.test(msg)) hint = '\nThis device or WebView does not expose WebNFC.';
                else if (/NotReadable|disabled/i.test(msg)) hint = '\nNFC adapter is off. Enable NFC in Android settings.';
                log(out, 'error: ' + msg + hint);
                logEvent('error', 'NFC scan: ' + msg);
                setPill('nfc-pill', 'bad', 'denied');
            }
        };
        $('nfc-clear').onclick = () => log(out, '');
    }

    // ── Notifications ──────────────────────────────────────────────
    function setupNotifications() {
        const out = 'not-out';
        if (!('Notification' in window)) {
            setPill('not-pill', 'bad', 'unsupported');
            log(out, 'The Notification API is not exposed by the Android System WebView. Web push / web notifications only work in real browsers. Use cordova-plugin-local-notification or FCM for native notifications.');
            return;
        }
        const titleInput = $('not-title');
        const bodyInput = $('not-body');
        if (cfg.appName) titleInput.value = cfg.appName;
        setPill('not-pill', Notification.permission === 'granted' ? 'ok' : 'run', Notification.permission);
        log(out, 'permission: ' + Notification.permission);
        $('not-req').onclick = async () => {
            // POST_NOTIFICATIONS is the Android runtime permission gating
            // notifications on Android 13+; the Web Notification permission
            // is a separate per-origin prompt.
            await requestRuntimePermission('POST_NOTIFICATIONS');
            const p = await Notification.requestPermission();
            setPill('not-pill', p === 'granted' ? 'ok' : 'bad', p);
            log(out, 'permission: ' + p);
            logEvent('info', 'Notification permission: ' + p);
        };
        $('not-show').onclick = () => {
            const title = titleInput.value || 'Slim Browser';
            const body = bodyInput.value || '';
            try {
                new Notification(title, { body });
                log(out, 'shown: "' + title + '" — "' + body + '"');
            } catch (e) { log(out, 'error: ' + e.message); }
        };
    }

    // ── Web Push / Service Worker ─────────────────────────────────
    async function setupPush() {
        const out = 'push-out';
        const ok = ('serviceWorker' in navigator) && ('PushManager' in window);
        setPill('push-pill', ok ? 'ok' : 'bad', ok ? 'available' : 'unsupported');
        if (!ok) {
            log(out, 'serviceWorker or PushManager missing. The Android System WebView does not expose Service Workers/Push to in-app pages — this only works in standalone browsers like Chrome.');
            return;
        }

        let registration = null;
        const titleInput = $('push-title');
        const bodyInput = $('push-body');

        $('push-reg').onclick = async () => {
            try {
                // Inline SW that listens for `push` events AND for the `message`
                // events we use to simulate one without a real push server.
                const swCode = `
                    self.addEventListener('install',  e => self.skipWaiting());
                    self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
                    function showFromPayload(payload) {
                        const data = payload || {};
                        return self.registration.showNotification(
                            data.title || 'Push',
                            { body: data.body || '', tag: data.tag || 'slim-push' }
                        );
                    }
                    self.addEventListener('push', e => {
                        let payload = {};
                        try { payload = e.data ? e.data.json() : {}; } catch (_) {
                            payload = { body: e.data ? e.data.text() : '' };
                        }
                        e.waitUntil(showFromPayload(payload));
                    });
                    self.addEventListener('message', e => {
                        if (e.data && e.data.type === 'simulate-push') {
                            e.waitUntil(showFromPayload(e.data.payload));
                        }
                    });
                `;
                const swUrl = URL.createObjectURL(new Blob([swCode], { type: 'application/javascript' }));
                registration = await navigator.serviceWorker.register(swUrl, { scope: './' });
                await navigator.serviceWorker.ready;
                let subscription = null;
                try { subscription = await registration.pushManager.getSubscription(); } catch (_) {}
                log(out, {
                    swRegistered: true,
                    scope: registration.scope,
                    pushManagerAvailable: !!registration.pushManager,
                    activeSubscription: !!subscription,
                    note: 'Subscribing to a real endpoint needs a VAPID-enabled server. Use "Simulate push" to trigger the SW notification path directly.'
                });
                setPill('push-pill', 'ok', 'sw active');
            } catch (e) { log(out, 'register failed: ' + e.message); setPill('push-pill', 'bad', 'error'); }
        };

        $('push-simulate').onclick = async () => {
            if (Notification.permission !== 'granted') {
                const p = await Notification.requestPermission();
                if (p !== 'granted') { log(out, 'notification permission ' + p); return; }
            }
            const reg = registration || await navigator.serviceWorker.getRegistration();
            if (!reg || !reg.active) { log(out, 'no active service worker — register first'); return; }
            const payload = {
                title: titleInput.value || 'Push',
                body: bodyInput.value || '',
                tag: 'slim-push-simulated'
            };
            reg.active.postMessage({ type: 'simulate-push', payload });
            log(out, 'posted simulate-push: ' + JSON.stringify(payload));
        };

        $('push-unsub').onclick = async () => {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
            registration = null;
            setPill('push-pill', 'ok', 'available');
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
        setPill('qr-pill', 'run', 'loading…');

        let scanner = null;
        let stop = null;

        function loadLib() {
            return new Promise((resolve, reject) => {
                if (window.Html5QrcodeScanner) return resolve();
                const s = document.createElement('script');
                s.src = 'lib/html5-qrcode.min.js';
                s.onload = () => window.Html5QrcodeScanner ? resolve() : reject(new Error('lib loaded but no Html5QrcodeScanner'));
                s.onerror = () => reject(new Error('lib/html5-qrcode.min.js missing — run npm run customize to bundle it'));
                document.head.appendChild(s);
            });
        }

        loadLib().then(() => setPill('qr-pill', 'ok', 'ready'))
                 .catch(e => { setPill('qr-pill', 'bad', 'missing'); log(out, e.message); });

        $('qr-start').onclick = async () => {
            try {
                await loadLib();
                host.innerHTML = '<div id="qr-reader"></div>';
                scanner = new Html5QrcodeScanner('qr-reader', {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    rememberLastUsedCamera: true,
                    showTorchButtonIfSupported: true
                }, false);
                scanner.render(
                    (text) => { log(out, text); setPill('qr-pill', 'ok', 'matched'); },
                    () => { /* per-frame errors are noisy — ignore */ }
                );
                stop = () => scanner.clear().catch(() => {});
                setPill('qr-pill', 'run', 'scanning');
            } catch (e) {
                log(out, 'error: ' + e.message);
                setPill('qr-pill', 'bad', 'error');
            }
        };
        $('qr-stop').onclick = () => {
            if (stop) stop();
            scanner = null; stop = null;
            host.innerHTML = '';
            setPill('qr-pill', 'ok', 'ready');
            log(out, 'stopped');
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
        setupLogPanel();
        bootEnv();
        logEvent('info', 'boot — ' + $('env').textContent);
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
        setupGeo();
        setupVibrate();
        setupClipboard();
        setupMotion();
    }

    if (inCordova()) document.addEventListener('deviceready', boot, false);
    else boot();
})();
