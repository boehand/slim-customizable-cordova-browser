#!/usr/bin/env bash
# Installs the Android command-line tools + platform 34 + build-tools 34.0.0,
# then `npm install` + `npm run customize` so the workspace is build-ready.
set -euo pipefail

SDK_DIR="${ANDROID_HOME:-/opt/android-sdk}"
CMDLINE_VERSION="${ANDROID_CMDLINE_VERSION:-11076708}"
CMDLINE_ZIP="commandlinetools-linux-${CMDLINE_VERSION}_latest.zip"

echo "==> Installing Android SDK into $SDK_DIR"
sudo mkdir -p "$SDK_DIR/cmdline-tools"
sudo chown -R "$(id -u):$(id -g)" "$SDK_DIR"

if [ ! -d "$SDK_DIR/cmdline-tools/latest" ]; then
    cd /tmp
    curl -fsSLo "$CMDLINE_ZIP" "https://dl.google.com/android/repository/${CMDLINE_ZIP}"
    unzip -q "$CMDLINE_ZIP" -d "$SDK_DIR/cmdline-tools"
    mv "$SDK_DIR/cmdline-tools/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
    rm "$CMDLINE_ZIP"
fi

export PATH="$SDK_DIR/cmdline-tools/latest/bin:$SDK_DIR/platform-tools:$PATH"

echo "==> Accepting licenses"
yes | sdkmanager --licenses >/dev/null 2>&1 || true

echo "==> Installing platform 34 + build-tools 34.0.0 + platform-tools"
sdkmanager --install \
    "platform-tools" \
    "platforms;android-34" \
    "build-tools;34.0.0" >/dev/null

echo "==> Installing npm dependencies"
cd "${WORKSPACE:-$(pwd)}"
npm install --no-audit --no-fund

echo "==> Generating config.xml from customize.json"
npm run customize

cat <<EOF

Android SDK ready at $SDK_DIR.
Build the APK with:
    npm run prepare:android   # adds platform + plugins
    npm run build:android     # builds debug APK + dist/cordova-bridge/
EOF
