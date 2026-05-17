/*
 * Slim Browser client.
 * Host this file on the same server as your page (Node-RED / Apache),
 * along with `cordova.js`, `cordova_plugins.js` and the `plugins/`
 * directory from `dist/cordova-bridge/` (produced by `npm run pack-client`).
 *
 *   <script src="cordova.js"></script>
 *   <script src="slim-browser-client.js"></script>
 *   <script>
 *     SlimBrowser.ready().then(() => {
 *       SlimBrowser.beacons.onRanging(snap => console.log(snap));
 *       SlimBrowser.beacons.start();
 *     });
 *   </script>
 *
 * For WebNFC and QR scanning use the standard browser APIs directly —
 * the native shell grants the necessary permissions.
 */
(function (global) {
    'use strict';

    if (global.SlimBrowser) return;

    const rangingListeners = new Set();
    const regionListeners = new Set();
    const errorListeners = new Set();
    const intentListeners = new Set();
    let delegate = null;

    function inShell() {
        return !!global.cordova;
    }

    function lm() {
        const c = global.cordova;
        if (!c || !c.plugins || !c.plugins.locationManager) {
            throw new Error('cordova-plugin-ibeacon not available');
        }
        return c.plugins.locationManager;
    }

    function toRegion(r) {
        const m = lm();
        const id = r.identifier || 'region-' + Math.random().toString(36).slice(2, 8);
        return new m.BeaconRegion(id, r.uuid, r.major || undefined, r.minor || undefined);
    }

    function emit(set, payload) {
        for (const fn of set) {
            try { fn(payload); } catch (e) { console.error('[SlimBrowser]', e); }
        }
    }

    function ensureDelegate() {
        if (delegate) return delegate;
        const m = lm();
        delegate = new m.Delegate();
        delegate.didDetermineStateForRegion = info => emit(regionListeners, { type: 'state', info });
        delegate.didStartMonitoringForRegion = info => emit(regionListeners, { type: 'started', info });
        delegate.didEnterRegion = info => emit(regionListeners, { type: 'enter', info });
        delegate.didExitRegion = info => emit(regionListeners, { type: 'exit', info });
        delegate.didRangeBeaconsInRegion = info => {
            const beacons = (info.beacons || []).map(b => ({
                uuid: b.uuid,
                major: b.major,
                minor: b.minor,
                proximity: b.proximity,
                rssi: b.rssi,
                accuracy: b.accuracy,
                tx: b.tx
            }));
            emit(rangingListeners, { region: info.region, beacons });
        };
        m.setDelegate(delegate);
        return delegate;
    }

    async function ensureBeaconAuthorization() {
        const m = lm();
        await new Promise((res, rej) => m.requestWhenInUseAuthorization().then(res, rej));
        try { await new Promise((res, rej) => m.requestAlwaysAuthorization().then(res, rej)); } catch (_) {}
    }

    async function startBeacons(regions) {
        const m = lm();
        ensureDelegate();
        const list = regions && regions.length ? regions : (global.SLIM_BROWSER_DEFAULT_REGIONS || []);
        await ensureBeaconAuthorization();
        for (const r of list) {
            const region = toRegion(r);
            await new Promise((res, rej) => m.startMonitoringForRegion(region).then(res, rej));
            await new Promise((res, rej) => m.startRangingBeaconsInRegion(region).then(res, rej));
        }
        return { regions: list };
    }

    async function stopBeacons(regions) {
        const m = lm();
        const list = regions && regions.length ? regions : (global.SLIM_BROWSER_DEFAULT_REGIONS || []);
        for (const r of list) {
            const region = toRegion(r);
            try { await new Promise((res, rej) => m.stopRangingBeaconsInRegion(region).then(res, rej)); } catch (e) { emit(errorListeners, e); }
            try { await new Promise((res, rej) => m.stopMonitoringForRegion(region).then(res, rej)); } catch (e) { emit(errorListeners, e); }
        }
        return { regions: list };
    }

    function bgMode() {
        const c = global.cordova;
        if (!c || !c.plugins || !c.plugins.backgroundMode) {
            throw new Error('cordova-plugin-background-mode not available');
        }
        return c.plugins.backgroundMode;
    }

    function enableBackground(opts) {
        const bg = bgMode();
        bg.setDefaults(Object.assign({
            title: document.title || 'Slim Browser',
            text: 'Scanning for beacons…',
            silent: false,
            hidden: false
        }, opts || {}));
        bg.enable();
        bg.on('activate', () => {
            if (bg.disableWebViewOptimizations) bg.disableWebViewOptimizations();
            if (bg.disableBatteryOptimizations) bg.disableBatteryOptimizations();
        });
    }

    function disableBackground() {
        try { bgMode().disable(); } catch (e) {}
    }

    function intentShim() {
        const p = global.plugins;
        if (!p || !p.intentShim) throw new Error('cordova-plugin-intentshim not available');
        return p.intentShim;
    }

    function startIntentListening() {
        try {
            intentShim().onIntent(intent => emit(intentListeners, intent));
            intentShim().getIntent(intent => intent && emit(intentListeners, intent), err => console.warn('[SlimBrowser] getIntent', err));
        } catch (e) {
            console.warn('[SlimBrowser] intent init:', e.message);
        }
    }

    function sendIntent(opts) {
        return new Promise((res, rej) => {
            try { intentShim().startActivity(opts, res, rej); } catch (e) { rej(e); }
        });
    }

    function broadcastIntent(opts) {
        return new Promise((res, rej) => {
            try { intentShim().sendBroadcast(opts, res, rej); } catch (e) { rej(e); }
        });
    }

    let readyResolve;
    const readyPromise = new Promise(res => { readyResolve = res; });

    function init() {
        if (!inShell()) {
            console.warn('[SlimBrowser] running outside native shell — beacons/intents disabled');
            readyResolve({ standalone: true });
            return;
        }
        startIntentListening();
        readyResolve({ standalone: false });
    }

    if (inShell()) {
        document.addEventListener('deviceready', init, false);
    } else if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 0);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    global.SlimBrowser = {
        ready: () => readyPromise,
        inShell,
        beacons: {
            start: startBeacons,
            stop: stopBeacons,
            onRanging: fn => { rangingListeners.add(fn); return () => rangingListeners.delete(fn); },
            onRegion: fn => { regionListeners.add(fn); return () => regionListeners.delete(fn); },
            onError: fn => { errorListeners.add(fn); return () => errorListeners.delete(fn); }
        },
        background: {
            enable: enableBackground,
            disable: disableBackground
        },
        intent: {
            send: sendIntent,
            broadcast: broadcastIntent,
            onReceived: fn => { intentListeners.add(fn); return () => intentListeners.delete(fn); }
        }
    };
})(window);
