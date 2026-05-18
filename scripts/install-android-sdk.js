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

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const ZIP_OS = isWin ? 'win' : isMac ? 'mac' : 'linux';
const ZIP_NAME = `commandlinetools-${ZIP_OS}-${CMDLINE_VERSION}_latest.zip`;
const ZIP_URL = `https://dl.google.com/android/repository/${ZIP_NAME}`;
const SCRIPT_EXT = isWin ? '.bat' : '';
const PATH_SEP = isWin ? ';' : ':';

function log(msg) { console.log('[install-android-sdk]', msg); }

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
        const fetch = (u) => https.get(u, { headers: { 'User-Agent': 'curl/8' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                res.resume();
                fetch(res.headers.location);
                return;
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
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

function acceptLicenses(sdkmanager) {
    return new Promise((resolve, reject) => {
        log('Accepting SDK licenses');
        const proc = spawn(sdkmanager, ['--licenses'], {
            stdio: ['pipe', 'inherit', 'inherit'],
            shell: isWin
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

function runSdkmanager(sdkmanager, args) {
    log('sdkmanager ' + args.join(' '));
    const r = spawnSync(sdkmanager, args, { stdio: 'inherit', shell: isWin });
    if (r.status !== 0) throw new Error('sdkmanager failed');
}

async function ensure(sdkPath = defaultSdkPath()) {
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

    await acceptLicenses(sdkmanager);
    runSdkmanager(sdkmanager, ['--install', ...REQUIRED]);

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

module.exports = { ensure, defaultSdkPath, isInstalled };

if (require.main === module) {
    ensure().then((sdk) => {
        printShellHints(sdk);
    }).catch((e) => {
        console.error('[install-android-sdk] FAILED:', e.message);
        process.exit(1);
    });
}
