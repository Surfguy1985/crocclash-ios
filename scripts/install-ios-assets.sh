#!/usr/bin/env bash
# Copies our AppIcon set + Splash imageset into the generated Xcode project
# Run automatically by codemagic.yaml after `npx cap sync ios`
set -e

PROJECT_ASSETS="ios/App/App/Assets.xcassets"

if [ ! -d "$PROJECT_ASSETS" ]; then
  echo "[install-ios-assets] $PROJECT_ASSETS not found — has cap added ios?"
  exit 0
fi

echo "[install-ios-assets] Installing AppIcon.appiconset"
rm -rf "$PROJECT_ASSETS/AppIcon.appiconset"
cp -R ios-assets/AppIcon.appiconset "$PROJECT_ASSETS/"

echo "[install-ios-assets] Installing Splash.imageset"
SPLASH_DIR="ios/App/App/Assets.xcassets/Splash.imageset"
rm -rf "$SPLASH_DIR"
cp -R ios-assets/Splash.imageset "$PROJECT_ASSETS/"

echo "[install-ios-assets] Done."
