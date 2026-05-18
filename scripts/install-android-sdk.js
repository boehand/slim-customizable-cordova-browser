#!/usr/bin/env node
/*
 * Cross-platform Android SDK installer.
 *
 *   - Detects whether an Android SDK with the required packages already exists.
 *   - If not, downloads `commandlinetools-*-latest.zip` from Google, extracts it
 *     into <user-home>/android-sdk/cmdline-tools/latest, accepts all licenses,
 *     and installs `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`.
 *
 * Usage:
 *   node scripts/install-android-sdk.js          # ensure SDK exists, prints path
 *   require('./install-android-sdk').ensure()    # programmatic, returns sdkPath
 *
 * On Windows we use PowerShell `Expand-Archive` (built-in). On Linux/macOS we use
 * `unzip`. Java must be on PATH (sdkmanager needs it).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { spawnSync, spawn } = require('child_process');

const CMDLINE_VERSION = '11076708';
const REQUIRED = [
    'platform-tools',
    'platforms;android-34',
    'build-tools;34.0.0'
];
const JDK_VERSION = '17';
const GRADLE_VERSION = '8.7';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const ZIP_OS = isWin ? 'win' : isMac ? 'mac' : 'linux';
const ZIP_NAME = `commandlinetools-${ZIP_OS}-${CMDLINE_VERSION}_latest.zip`;
const ZIP_URL = `https://dl.google.com/android/repository/${ZIP_NAME}`;
const SCRIPT_EXT = isWin ? '.bat' : '';
const PATH_SEP = isWin ? ';' : ':';

const JDK_CACHE = path.join(os.homedir(), '.slim-cordova-jdk-' + JDK_VERSION);
const GRADLE_CACHE = path.join(os.homedir(), '.slim-cordova-gradle-' + GRADLE_VERSION);

function log(msg) { console.log('[install-android-sdk]', msg); }

/**
 * Best-effort JAVA_HOME detection. sdkmanager.bat on Windows refuses to run
 * without it even though Cordova itself only needs `java` on PATH.
 */
function findJavaHome() {
    if (process.env.JAVA_HOME && fs.existsSync(javaBinIn(process.env.JAVA_HOME))) {
        return process.env.JAVA_HOME;
    }
    const cached = cachedJavaHome();
    if (cached) return cached;
    const probe = spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8' });
    const out = (probe.stderr || '') + (probe.stdout || '');
    const m = out.match(/java\.home\s*=\s*(.+)/);
    if (m) return m[1].trim();
    const finder = isWin ? 'where' : 'which';
    const r = spawnSync(finder, ['java'], { encoding: 'utf8' });
    if (r.status === 0) {
        const javaBin = r.stdout.split(/\r?\n/)[0].trim();
        if (javaBin) {
            try {
                const real = fs.realpathSync(javaBin);
                return path.dirname(path.dirname(real));
            } catch (_) {
                return path.dirname(path.dirname(javaBin));
            }
        }
    }
    return null;
}

function javaBinIn(home) {
    return path.join(home, 'bin', isWin ? 'java.exe' : 'java');
}

function cachedJavaHome() {
    if (!fs.existsSync(JDK_CACHE)) return null;
    for (const entry of fs.readdirSync(JDK_CACHE)) {
        const candidate = path.join(JDK_CACHE, entry);
        if (!fs.statSync(candidate).isDirectory()) continue;
        const macHome = path.join(candidate, 'Contents', 'Home');
        if (isMac && fs.existsSync(javaBinIn(macHome))) return macHome;
        if (fs.existsSync(javaBinIn(candidate))) return candidate;
    }
    return null;
}

/**
 * Returns a usable JAVA_HOME, downloading Temurin JDK 17 from Adoptium if
 * no Java is detected on the system. Idempotent: once cached under
 * ~/.slim-cordova-jdk-17/ it is reused on every run.
 */
async function ensureJava() {
    const existing = findJavaHome();
    if (existing) return existing;

    log('No Java found on PATH or JAVA_HOME; installing Temurin JDK ' + JDK_VERSION);
    fs.mkdirSync(JDK_CACHE, { recursive: true });

    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
    const osName = isWin ? 'windows' : isMac ? 'mac' : 'linux';
    const ext = isWin ? 'zip' : 'tar.gz';
    const apiUrl = `https://api.adoptium.net/v3/binary/latest/${JDK_VERSION}/ga/${osName}/${arch}/jdk/hotspot/normal/eclipse?project=jdk`;
    const tmp = path.join(os.tmpdir(), `temurin-jdk-${JDK_VERSION}.${ext}`);

    log('Downloading ' + apiUrl);
    await download(apiUrl, tmp);

    if (isWin) {
        unzip(tmp, JDK_CACHE);
    } else {
        log('Extracting ' + tmp);
        const r = spawnSync('tar', ['-xzf', tmp, '-C', JDK_CACHE], { stdio: 'inherit' });
        if (r.status !== 0) throw new Error('tar -xzf failed; is `tar` installed?');
    }
    try { fs.unlinkSync(tmp); } catch (_) {}

    const home = cachedJavaHome();
    if (!home) throw new Error('JDK archive extracted but no usable bin/java found in ' + JDK_CACHE);
    log('JDK ready at ' + home);
    return home;
}

function cachedGradleBin() {
    if (!fs.existsSync(GRADLE_CACHE)) return null;
    const dir = path.join(GRADLE_CACHE, `gradle-${GRADLE_VERSION}`, 'bin');
    const exe = path.join(dir, isWin ? 'gradle.bat' : 'gradle');
    return fs.existsSync(exe) ? dir : null;
}

function findSystemGradleBin(env) {
    const finder = isWin ? 'where' : 'which';
    const r = spawnSync(finder, ['gradle'], { encoding: 'utf8', env: env || process.env });
    if (r.status !== 0) return null;
    const first = r.stdout.split(/\r?\n/)[0].trim();
    if (!first) return null;
    try { return path.dirname(fs.realpathSync(first)); }
    catch (_) { return path.dirname(first); }
}

/**
 * cordova-android 13 needs `gradle` on PATH ONCE to generate the gradle wrapper
 * (after that `gradlew` takes over). Reuse a system gradle if found, otherwise
 * download Gradle ${GRADLE_VERSION} into ~/.slim-cordova-gradle-${GRADLE_VERSION}/.
 */
async function ensureGradle(env) {
    const system = findSystemGradleBin(env);
    if (system) return system;
    const cached = cachedGradleBin();
    if (cached) return cached;

    log('No gradle found on PATH; installing Gradle ' + GRADLE_VERSION);
    fs.mkdirSync(GRADLE_CACHE, { recursive: true });
    const url = `https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`;
    const zip = path.join(os.tmpdir(), `gradle-${GRADLE_VERSION}-bin.zip`);
    log('Downloading ' + url);
    await download(url, zip);
    log('Extracting ' + zip);
    unzip(zip, GRADLE_CACHE);
    try { fs.unlinkSync(zip); } catch (_) {}

    const bin = cachedGradleBin();
    if (!bin) throw new Error('Gradle archive extracted but no bin/gradle found in ' + GRADLE_CACHE);
    log('Gradle ready at ' + bin);
    return bin;
}

function defaultSdkPath() {
    if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME;
    if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT;
    const home = os.homedir();
    return isWin
        ? path.join(process.env.LOCALAPPDATA || home, 'Android', 'Sdk')
        : path.join(home, 'android-sdk');
}

function pkgPath(sdk, pkg) {
    return path.join(sdk, ...pkg.replace(/;/g, '/').split('/'));
}

function isInstalled(sdk) {
    const mgr = path.join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager' + SCRIPT_EXT);
    if (!fs.existsSync(mgr)) return false;
    return REQUIRED.every(p => fs.existsSync(pkgPath(sdk, p)));
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        let hops = 0;
        const fetch = (u) => https.get(u, { headers: { 'User-Agent': 'curl/8' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (++hops > 10) { file.close(); fs.unlinkSync(dest); reject(new Error('Too many redirects')); return; }
                const next = new URL(res.headers.location, u).toString();
                res.resume();
                fetch(next);
                return;
            }
            if (res.statusCode !== 200) {
                file.close();
                try { fs.unlinkSync(dest); } catch (_) {}
                reject(new Error(`HTTP ${res.statusCode} for ${u}`));
                return;
            }
            const total = parseInt(res.headers['content-length'] || '0', 10);
            let got = 0, lastPct = -10;
            res.on('data', (chunk) => {
                got += chunk.length;
                if (total) {
                    const pct = Math.floor(got * 100 / total);
                    if (pct - lastPct >= 10) { lastPct = pct; process.stdout.write(`  ${pct}%\r`); }
                }
            });
            res.pipe(file);
            file.on('finish', () => { process.stdout.write('\n'); file.close(resolve); });
        }).on('error', reject);
        fetch(url);
    });
}

function unzip(zipPath, dest) {
    fs.mkdirSync(dest, { recursive: true });
    if (isWin) {
        const r = spawnSync('powershell', [
            '-NoProfile', '-NonInteractive', '-Command',
            `Expand-Archive -Force -Path "${zipPath}" -DestinationPath "${dest}"`
        ], { stdio: 'inherit' });
        if (r.status !== 0) throw new Error('Expand-Archive failed');
    } else {
        const r = spawnSync('unzip', ['-q', '-o', zipPath, '-d', dest], { stdio: 'inherit' });
        if (r.status !== 0) throw new Error('unzip failed (is it installed?)');
    }
}

function sdkmanagerEnv(javaHome) {
    if (!javaHome) javaHome = findJavaHome();
    if (!javaHome) {
        throw new Error('No Java found and JDK install was skipped — call ensureJava() first.');
    }
    const env = { ...process.env, JAVA_HOME: javaHome };
    const javaBin = path.join(javaHome, 'bin');
    env.PATH = javaBin + PATH_SEP + (env.PATH || '');
    return env;
}

function acceptLicenses(sdkmanager, javaHome) {
    return new Promise((resolve, reject) => {
        log('Accepting SDK licenses');
        const env = sdkmanagerEnv(javaHome);
        const proc = spawn(sdkmanager, ['--licenses'], {
            stdio: ['pipe', 'inherit', 'inherit'],
            shell: isWin,
            env
        });
        const interval = setInterval(() => {
            try { proc.stdin.write('y\n'); } catch (_) { clearInterval(interval); }
        }, 200);
        proc.on('exit', (code) => {
            clearInterval(interval);
            try { proc.stdin.end(); } catch (_) {}
            if (code === 0) resolve();
            else reject(new Error(`sdkmanager --licenses exited ${code}`));
        });
        proc.on('error', reject);
    });
}

function runSdkmanager(sdkmanager, args, javaHome) {
    log('sdkmanager ' + args.join(' '));
    const env = sdkmanagerEnv(javaHome);
    const r = spawnSync(sdkmanager, args, { stdio: 'inherit', shell: isWin, env });
    if (r.status !== 0) throw new Error('sdkmanager failed');
}

async function ensure(sdkPath = defaultSdkPath()) {
    const javaHome = await ensureJava();

    if (isInstalled(sdkPath)) {
        log('SDK already present at ' + sdkPath);
        return sdkPath;
    }

    fs.mkdirSync(path.join(sdkPath, 'cmdline-tools'), { recursive: true });

    const sdkmanager = path.join(sdkPath, 'cmdline-tools', 'latest', 'bin', 'sdkmanager' + SCRIPT_EXT);

    if (!fs.existsSync(sdkmanager)) {
        const tmpZip = path.join(os.tmpdir(), ZIP_NAME);
        log('Downloading ' + ZIP_URL);
        await download(ZIP_URL, tmpZip);
        const extractDir = path.join(sdkPath, 'cmdline-tools', '_unzip');
        if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
        log('Extracting ' + tmpZip);
        unzip(tmpZip, extractDir);
        // The zip contains "cmdline-tools/..."; move it to "latest"
        const inner = path.join(extractDir, 'cmdline-tools');
        const latest = path.join(sdkPath, 'cmdline-tools', 'latest');
        if (fs.existsSync(latest)) fs.rmSync(latest, { recursive: true, force: true });
        fs.renameSync(inner, latest);
        fs.rmSync(extractDir, { recursive: true, force: true });
        try { fs.unlinkSync(tmpZip); } catch (_) {}
    }

    await acceptLicenses(sdkmanager, javaHome);
    runSdkmanager(sdkmanager, ['--install', ...REQUIRED], javaHome);

    log('SDK ready at ' + sdkPath);
    return sdkPath;
}

function printShellHints(sdk) {
    const platTools = path.join(sdk, 'platform-tools');
    const cmdTools = path.join(sdk, 'cmdline-tools', 'latest', 'bin');
    console.log('');
    console.log('Add these to your shell for future terminals:');
    if (isWin) {
        console.log(`  setx ANDROID_HOME "${sdk}"`);
        console.log(`  setx PATH "%PATH%${PATH_SEP}${platTools}${PATH_SEP}${cmdTools}"`);
    } else {
        console.log(`  export ANDROID_HOME="${sdk}"`);
        console.log(`  export PATH="$PATH:${platTools}:${cmdTools}"`);
    }
}

module.exports = { ensure, ensureJava, ensureGradle, defaultSdkPath, isInstalled, findJavaHome };

if (require.main === module) {
    ensure().then((sdk) => {
        printShellHints(sdk);
    }).catch((e) => {
        console.error('[install-android-sdk] FAILED:', e.message);
        process.exit(1);
    });
}
