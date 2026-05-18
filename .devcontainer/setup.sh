#!/usr/bin/env bash
# Runs once when a Codespace boots: installs npm deps + generates config + ensures Android SDK.
set -euo pipefail

cd "${WORKSPACE:-$(pwd)}"

echo "==> npm install"
npm install --no-audit --no-fund

echo "==> generating config.xml"
npm run customize

echo "==> ensuring Android SDK"
node scripts/install-android-sdk.js

cat <<EOF

Codespace ready. Try:
    npm test
    npm run prepare:android   # adds platform + plugins
    npm run build:android     # builds debug APK + dist/cordova-bridge/
EOF
