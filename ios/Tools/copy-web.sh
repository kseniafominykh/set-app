#!/bin/bash
# Кладёт веб-приложение из корня репозитория в SET.app/Web при каждой сборке Xcode.
# Отдельной копии веба для iOS нет: правки делаются в index.html, styles.css, app.js в корне.
set -euo pipefail

REPO="$(cd "$SRCROOT/.." && pwd)"
DEST="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/Web"

mkdir -p "$DEST/icons"
for f in index.html styles.css app.js manifest.webmanifest; do
    [ -f "$REPO/$f" ] || { echo "error: нет $REPO/$f"; exit 1; }
    cp "$REPO/$f" "$DEST/$f"
done
cp "$REPO"/icons/*.png "$DEST/icons/"
# fonts/ приезжает отдельной папкой ресурсов (ios/Web/fonts), в Web она не нужна
echo "Веб-приложение скопировано в $DEST"
