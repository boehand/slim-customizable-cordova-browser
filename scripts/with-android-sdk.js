#!/usr/bin/env node
/*
 * Runs a command with ANDROID_HOME / ANDROID_SDK_ROOT / JAVA_HOME / PATH
 * exported, after making sure both the JDK and the Android SDK are
 * installed (idempotent — fast on subsequent runs).
 *
 *   node scripts/with-android-sdk.js cordova build android
 *   node scripts/with-android-sdk.js cordova run android --device
 *
 * For commands that are installed as a local devDependency (e.g. cordova on
 * Windows where node_modules/.bin/cordova.cmd is not always picked up by
 * cmd.exe via shell:true) we resolve the package's `bin` entry directly and
 * invoke it through `node`. This avoids the entire PATHEXT / cmd / .cmd
 * resolution dance.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ensure, ensureJava, ensureGradle } = require('./install-android-sdk');

const isWin = process.platform === 'win32';
const PATH_SEP = isWin ? ';' : ':';

function resolveLocalBin(cmd) {
    try {
        const pkgPath = require.resolve(cmd + '/package.json', { paths: [path.resolve(__dirname, '..')] });
        const pkg = require(pkgPath);
        const dir = path.dirname(pkgPath);
        let rel = null;
        if (typeof pkg.bin === 'string') rel = pkg.bin;
        else if (pkg.bin && pkg.bin[cmd]) rel = pkg.bin[cmd];
        if (rel) {
            const abs = path.join(dir, rel);
            if (fs.existsSync(abs)) return abs;
        }
    } catch (_) {}
    return null;
}

function caseInsensitiveKey(obj, name) {
    return Object.keys(obj).find(k => k.toUpperCase() === name.toUpperCase()) || name;
}

async function main() {
    const javaHome = await ensureJava();
    const sdk = await ensure();

    const env = { ...process.env };
    env.ANDROID_HOME = sdk;
    env.ANDROID_SDK_ROOT = sdk;
    env.JAVA_HOME = javaHome;

    const gradleBin = await ensureGradle(env);

    const extraPath = [
        path.join(javaHome, 'bin'),
        gradleBin,
        path.join(sdk, 'platform-tools'),
        path.join(sdk, 'cmdline-tools', 'latest', 'bin')
    ];
    const pathKey = caseInsensitiveKey(env, 'PATH');
    env[pathKey] = extraPath.join(PATH_SEP) + PATH_SEP + (env[pathKey] || '');

    const argv = process.argv.slice(2);
    if (argv.length === 0) {
        console.error('[with-android-sdk] usage: node with-android-sdk.js <command> [args...]');
        process.exit(2);
    }

    const cmd = argv[0];
    const args = argv.slice(1);

    let actualCmd, actualArgs, useShell;
    const localBin = resolveLocalBin(cmd);
    if (localBin) {
        actualCmd = process.execPath;
        actualArgs = [localBin, ...args];
        useShell = false;
    } else {
        actualCmd = cmd;
        actualArgs = args;
        useShell = isWin;
    }

    const r = spawnSync(actualCmd, actualArgs, { stdio: 'inherit', env, shell: useShell });
    process.exit(r.status == null ? 1 : r.status);
}

main().catch((e) => {
    console.error('[with-android-sdk] FAILED:', e.message);
    process.exit(1);
});
