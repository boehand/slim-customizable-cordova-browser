# slim-customizable-cordova-browser

A minimal, modern Cordova/Android shell that turns a remote web page
(Node-RED dashboard, Apache, anything HTTP) into a native Android app
with full access to:

- **iBeacon scanning** via [`cordova-plugin-ibeacon`](https://github.com/petermetz/cordova-plugin-ibeacon)
- **Background scanning** via [`cordova-plugin-background-mode`](https://github.com/katzer/cordova-plugin-background-mode)
- **Android Intents** via [`cordova-plugin-intentshim`](https://github.com/darryncampbell/darryncampbell-cordova-plugin-intent)
- **WebNFC** (`NDEFReader`) and **camera-based QR scanning** ([html5-qrcode](https://github.com/mebjas/html5-qrcode)) directly in the WebView

Inspired by [evothings-viewer](https://github.com/evothings/evothings-viewer)
and the [ibeacon-scan example](https://github.com/evothings/evothings-examples/tree/master/examples/ibeacon-scan)
— but trimmed down to what runs on modern Cordova (Android 13+, AndroidX, target API 34).

---

## How it works

The app is a normal **Android WebView**. The `<content src>` in `config.xml`
is set to your configured remote URL, so the WebView loads it directly —
no iframe in between. To use the device plugins from your remote page you
include two scripts:

```html
<script src="cordova.js"></script>
<script src="slim-browser-client.js"></script>
```

Both files come from `dist/cordova-bridge/`, produced by `npm run pack-client`
after a build. You upload that folder to the same web server that hosts your
page.

If no URL is configured (or the user is offline before first build), the
WebView falls back to a small local instruction page in `www/`.

---

## Building in a GitHub Codespace

A `.devcontainer/` is included so a fresh Codespace boots ready to build:

1. Open the repo on GitHub → **Code ▾ → Codespaces → Create codespace on `claude/cordova-beacon-browser-SJ6cl`**.
2. The post-create script installs the Android command-line tools, platform
   34, build-tools 34.0.0, then runs `npm install` and `npm run customize`.
3. Once the terminal returns to a prompt:

   ```bash
   npm run prepare:android    # platform + plugins
   npm run build:android      # debug APK + dist/cordova-bridge/
   ```

The APK lands in
`platforms/android/app/build/outputs/apk/debug/app-debug.apk`, the web
bridge in `dist/cordova-bridge/`.

## Build pipeline status

The pipeline was end-to-end verified up to the Android-SDK boundary:

| Step | Verified | Notes |
|---|---|---|
| `npm install` | ✅ | Cordova 12 + cordova-android 13 |
| `npm run customize` | ✅ | Generates `config.xml` + `www/js/config.js` |
| `cordova platform add android@13.0.0` | ✅ | |
| `cordova plugin add cordova-plugin-ibeacon@3.8.1` | ✅ | `cordova.plugins.locationManager` |
| `cordova plugin add cordova-plugin-background-mode-fixes@0.7.6` | ✅ | `cordova.plugins.backgroundMode` |
| `cordova plugin add darryncampbell-cordova-plugin-intent` (Git) | ✅ | `window.intentShim` |
| `cordova plugin add cordova-plugin-android-permissions@1.1.5` | ✅ | |
| `cordova prepare android` | ✅ | Bridges + plugin JS landed in `platforms/.../assets/www/` |
| `npm run pack-client` | ✅ | `dist/cordova-bridge/` populated |
| `cordova build android` | ⛔️ | Needs `ANDROID_HOME` + Android SDK (API 34) on the host |
| `npm test` | ✅ | 19 unit + integration tests pass |

> The intent plugin is pulled from its GitHub repository because the package
> is no longer published to npm under its original name.

## Quick start

Requirements:

- Node.js 18+
- Internet access to `dl.google.com`, `api.adoptium.net` and Maven Central

You do **not** need to install Android Studio, the Android SDK, or even a JDK
by hand. On first run `npm run sdk:install` (and every `build:android` /
`run:android` invocation) will:

1. Detect a usable JDK (env `JAVA_HOME`, then `java -XshowSettings:properties
   -version`, then `where`/`which java`). If nothing is found, download Temurin
   JDK 17 from Adoptium into `~/.slim-cordova-jdk-17/`.
2. Install the Android command-line tools into `~/android-sdk` (or
   `%LOCALAPPDATA%\Android\Sdk` on Windows), accept all licenses, and install
   `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`.

Both steps are idempotent — subsequent runs check the cache and skip in milliseconds.

```bash
git clone https://github.com/boehand/slim-customizable-cordova-browser
cd slim-customizable-cordova-browser

# 1. install Cordova + dev deps
npm install

# 2. edit customize.json (url, appName, beacon UUID, …)

# 3. one-shot: apply config + add platform + install plugins
#    (auto-installs Android SDK on first run)
npm run prepare:android

# 4. build a debug APK (also writes dist/cordova-bridge/)
npm run build:android
# → platforms/android/app/build/outputs/apk/debug/app-debug.apk
# → dist/cordova-bridge/    (upload this to your web server)
```

If you already have the SDK and just want to set the path, point
`ANDROID_HOME` at it before running npm — the installer detects it and skips
the download.

Other commands:

```bash
npm run customize        # re-apply customize.json → config.xml + www/js/config.js
npm run pack-client      # rebuild dist/cordova-bridge/ from the prepared platform
npm run run:android      # build + install + launch on a connected device
npm run build:android:release
npm run clean
```

---

## Customizing the app

Everything is in **`customize.json`**:

```jsonc
{
  "appId": "com.example.slimbrowser",   // Android package
  "appName": "Slim Browser",
  "version": "1.0.0",
  "url": "https://node-red.local/ui",   // → <content src>
  "ui": {
    "splashColor": "#1a1a1a",
    "loadingText": "Loading…"
  },
  "beacons": {
    "regions": [
      { "identifier": "default", "uuid": "B9407F30-F5F8-466E-AFF9-25556B57FE6D" }
    ]
  },
  "navigation": {
    "allowedOrigins": ["https://node-red.local/*"]
  }
}
```

Whenever you change it, run `npm run customize` (or just `npm run build:android`,
which calls it).

### App icon

Drop your icons into `res/icon/android/` and reference them in `config.xml`,
or rely on the Cordova default for the first build.

---

## Setting up your web server

`npm run pack-client` produces:

```
dist/cordova-bridge/
├── cordova.js
├── cordova_plugins.js
├── plugins/                  (per-plugin JS, required by cordova_plugins.js)
└── slim-browser-client.js
```

Copy that whole folder to your web server so the files are reachable from
the URL configured in `customize.json`. Typical layouts:

- **Apache**: drop it under your DocumentRoot
- **Node-RED**: set `httpStatic` in `settings.js`, then place the folder there
- **nginx**: serve it from a `location /cordova-bridge/ { ... }` block

Then in your page (Node-RED `ui_template`, Apache HTML, …):

```html
<script src="cordova-bridge/cordova.js"></script>
<script src="cordova-bridge/slim-browser-client.js"></script>
<script>
  SlimBrowser.ready().then(() => {
    SlimBrowser.beacons.onRanging(snap => console.log(snap));
    SlimBrowser.beacons.start();
  });
</script>
```

> The bridge files must be served from the same origin as the page that uses
> them (browser security). HTTPS is required for WebNFC.

---

## `SlimBrowser` API

| Call | Description |
|---|---|
| `SlimBrowser.ready()` | Resolves once `deviceready` has fired (or immediately in standalone mode) |
| `SlimBrowser.inShell()` | `true` when running inside the native shell |
| `SlimBrowser.beacons.start([regions])` | Start monitoring + ranging for the given regions (or `window.SLIM_BROWSER_DEFAULT_REGIONS`) |
| `SlimBrowser.beacons.stop([regions])` | Stop scanning |
| `SlimBrowser.beacons.onRanging(fn)` | Callback `({ region, beacons[] })` ~1×/s |
| `SlimBrowser.beacons.onRegion(fn)` | Enter/exit/state changes |
| `SlimBrowser.beacons.onError(fn)` | Errors |
| `SlimBrowser.background.enable(opts?)` | Keep the app alive in the background (shows a foreground notification) |
| `SlimBrowser.background.disable()` | |
| `SlimBrowser.intent.send(opts)` | `startActivity` via intentshim |
| `SlimBrowser.intent.broadcast(opts)` | `sendBroadcast` |
| `SlimBrowser.intent.onReceived(fn)` | Receives intents delivered to the app |

Example intent:

```js
SlimBrowser.intent.send({
  action: 'android.intent.action.VIEW',
  url: 'geo:52.520008,13.404954?q=Berlin'
});
```

### WebNFC + QR

Both use standard browser APIs and need no shell bridge — the WebView is
granted `CAMERA` + `NFC` by the generated `AndroidManifest.xml`. See
`examples/nfc-reader.html` and `examples/qr-scanner.html`.

WebNFC only works on **Android Chrome WebView ≥ 89** over **HTTPS**.

---

## Copy-paste examples

All ready to drop next to `cordova-bridge/`:

| File | Demo |
|---|---|
| [`examples/all-in-one.html`](examples/all-in-one.html) | Tabs for beacons + NFC + QR + Intent |
| [`examples/beacon-scanner.html`](examples/beacon-scanner.html) | Live ranging table with Start/Stop/Background |
| [`examples/qr-scanner.html`](examples/qr-scanner.html) | html5-qrcode scanner |
| [`examples/nfc-reader.html`](examples/nfc-reader.html) | WebNFC NDEF reader |
| [`examples/node-red-template.html`](examples/node-red-template.html) | Snippet for a Node-RED Dashboard `ui_template` |
| [`examples/index.html`](examples/index.html) | Tiny launcher linking to the others |

---

## Permissions

`scripts/customize.js` writes the following into the generated `config.xml`:

- `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`
- `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK`
- `RECEIVE_BOOT_COMPLETED` (so background scanning can restart after a reboot)
- `CAMERA`, `NFC`, `VIBRATE`

On Android 12+ the user must grant *Nearby devices* and *Precise + Background
location* at runtime. The default beacon flow handles this via
`requestAlwaysAuthorization`.

---

## Project layout

```
.
├── customize.json               # the only file most users edit
├── scripts/
│   ├── customize.js             # turns customize.json into config.xml + www/js/config.js
│   └── pack-client.js           # bundles cordova bridge files into dist/cordova-bridge/
├── www/                         # fallback page shown only when no URL is configured
├── examples/
│   ├── slim-browser-client.js   # ships into dist/cordova-bridge/
│   ├── all-in-one.html
│   ├── beacon-scanner.html
│   ├── qr-scanner.html
│   ├── nfc-reader.html
│   ├── node-red-template.html
│   └── index.html
└── config.xml                   # generated; do not edit by hand
```

---

## License

Apache-2.0. See `LICENSE`.
