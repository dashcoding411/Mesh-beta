#!/bin/sh
# Renders the iPhone app icon and launch screen from scripts/app-icon.html.
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ICONS=ios/App/App/Assets.xcassets
"$CHROME" --headless --hide-scrollbars --window-size=1024,1024 \
  --screenshot="$ICONS/AppIcon.appiconset/AppIcon-512@2x.png" "file://$PWD/scripts/app-icon.html" 2>/dev/null
"$CHROME" --headless --hide-scrollbars --window-size=2732,2732 \
  --screenshot="$ICONS/Splash.imageset/splash-2732x2732.png" "file://$PWD/scripts/app-icon.html?splash=1" 2>/dev/null
cp "$ICONS/Splash.imageset/splash-2732x2732.png" "$ICONS/Splash.imageset/splash-2732x2732-1.png"
cp "$ICONS/Splash.imageset/splash-2732x2732.png" "$ICONS/Splash.imageset/splash-2732x2732-2.png"
echo "App icon and launch screen updated."
