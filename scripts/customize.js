#!/usr/bin/env node
/*
 * Applies customize.json to config.xml and www/js/config.js.
 * Re-run after any change to customize.json.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'customize.json');
const CONFIG_XML_PATH = path.join(ROOT, 'config.xml');
const WWW_CONFIG_PATH = path.join(ROOT, 'www', 'js', 'config.js');

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function loadCustomize() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('customize.json not found at ' + CONFIG_PATH);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function buildAllowList(c) {
  const origins = (c.navigation && c.navigation.allowedOrigins) || [];
  const seen = new Set();
  const lines = [];
  try {
    const remote = new URL(c.url);
    const star = `${remote.protocol}//${remote.host}/*`;
    seen.add(star);
    lines.push(`    <allow-navigation href="${escapeXml(star)}" />`);
  } catch (_) {}
  for (const o of origins) {
    if (seen.has(o)) continue;
    seen.add(o);
    lines.push(`    <allow-navigation href="${escapeXml(o)}" />`);
  }
  return lines.join('\n');
}

function buildConfigXml(c) {
  const author = c.author || {};
  const ui = c.ui || {};
  const android = c.android || {};
  const allowList = buildAllowList(c);
  const contentSrc = c.url || 'index.html';

  return `<?xml version='1.0' encoding='utf-8'?>
<widget id="${escapeXml(c.appId)}" version="${escapeXml(c.version)}" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0" xmlns:android="http://schemas.android.com/apk/res/android">
    <name>${escapeXml(c.appName)}</name>
    <description>${escapeXml(c.description || '')}</description>
    <author email="${escapeXml(author.email || '')}" href="${escapeXml(author.url || '')}">${escapeXml(author.name || '')}</author>
    <content src="${escapeXml(contentSrc)}" />
    <access origin="*" />
${allowList}
    <allow-intent href="http://*/*" />
    <allow-intent href="https://*/*" />
    <allow-intent href="tel:*" />
    <allow-intent href="sms:*" />
    <allow-intent href="mailto:*" />
    <allow-intent href="geo:*" />
    <preference name="BackgroundColor" value="${escapeXml(ui.splashColor || '#1a1a1a')}" />
    <preference name="Fullscreen" value="false" />
    <preference name="ShowSplashScreen" value="false" />
    <preference name="AndroidPersistentFileLocation" value="Compatibility" />
    <platform name="android">
        <preference name="android-minSdkVersion" value="${android.minSdkVersion || 23}" />
        <preference name="android-targetSdkVersion" value="${android.targetSdkVersion || 34}" />
        <preference name="AndroidXEnabled" value="true" />
        <preference name="MixedContentMode" value="${android.allowMixedContent ? 0 : 1}" />
        <edit-config file="app/src/main/AndroidManifest.xml" mode="merge" target="/manifest/application">
            <application android:usesCleartextTraffic="true" />
        </edit-config>
        <config-file target="AndroidManifest.xml" parent="/manifest">
            <uses-permission android:name="android.permission.BLUETOOTH" />
            <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
            <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
            <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
            <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
            <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
            <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
            <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
            <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
            <uses-permission android:name="android.permission.WAKE_LOCK" />
            <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
            <uses-permission android:name="android.permission.CAMERA" />
            <uses-permission android:name="android.permission.NFC" />
            <uses-permission android:name="android.permission.VIBRATE" />
            <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
            <uses-feature android:name="android.hardware.camera" android:required="false" />
            <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
            <uses-feature android:name="android.hardware.nfc" android:required="false" />
        </config-file>
    </platform>
</widget>
`;
}

function buildClientConfig(c) {
  const safe = {
    url: c.url,
    appName: c.appName,
    ui: c.ui || {},
    beacons: c.beacons || { regions: [] },
    android: c.android || {}
  };
  return `/* AUTO-GENERATED by scripts/customize.js. Do not edit by hand. */\n` +
         `window.SLIM_BROWSER_CONFIG = ${JSON.stringify(safe, null, 2)};\n`;
}

function main() {
  const c = loadCustomize();
  fs.writeFileSync(CONFIG_XML_PATH, buildConfigXml(c));
  fs.writeFileSync(WWW_CONFIG_PATH, buildClientConfig(c));
  console.log('[customize] Wrote', path.relative(ROOT, CONFIG_XML_PATH));
  console.log('[customize] Wrote', path.relative(ROOT, WWW_CONFIG_PATH));
  console.log('[customize] App:', c.appName, '(' + c.appId + ')  →', c.url);
}

try {
  main();
} catch (e) {
  console.error('[customize] ERROR:', e.message);
  process.exit(1);
}
