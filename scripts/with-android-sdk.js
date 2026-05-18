#!/usr/bin/env node
/*
 * Runs a command with ANDROID_HOME/ANDROID_SDK_ROOT/PATH exported, after
 * making sure the SDK is installed (idempotent — fast on subsequent runs).
 *
 *   node scripts/with-android-sdk.js cordova build android
 *   node scripts/with-android-sdk.js cordova run android --device
 *
 * Required so `npm run build:android` works on a clean machine where the
 * developer has not yet set ANDROID_HOME themselves.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { ensure, findJavaHome } = require('./install-android-sdk');

const isWin = process.platform === 'win32';
const PATH_SEP = isWin ? ';' : ':';

async function main() {
    const sdk = await ensure();
    const env = { ...process.env };
    env.ANDROID_HOME = sdk;
    env.ANDROID_SDK_ROOT = sdk;
    const javaHome = findJavaHome();
    if (javaHome) {
        env.JAVA_HOME = javaHome;
    }
    const extraPath = [
        path.join(sdk, 'platform-tools'),
        path.join(sdk, 'cmdline-tools', 'latest', 'bin')
    ];
    if (javaHome) extraPath.unshift(path.join(javaHome, 'bin'));
    env.PATH = extraPath.join(PATH_SEP) + PATH_SEP + (env.PATH || '');

    const argv = process.argv.slice(2);
    if (argv.length === 0) {
        console.error('[with-android-sdk] usage: node with-android-sdk.js <command> [args...]');
        process.exit(2);
    }

    const r = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit', env, shell: isWin });
    process.exit(r.status == null ? 1 : r.status);
}

main().catch((e) => {
    console.error('[with-android-sdk] FAILED:', e.message);
    process.exit(1);
});
