#!/bin/sh
# UltraChat para OBS — instalador para macOS e Linux.
# Uso: abra o Terminal nesta pasta e rode:  sh install.sh
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"
case "$(uname -s)" in
  Darwin) DEST="$HOME/Library/Application Support/UltraChat" ;;
  *)      DEST="${XDG_DATA_HOME:-$HOME/.local/share}/ultrachat" ;;
esac

echo ""
echo "  UltraChat para OBS — instalação"
echo "  Pasta: $DEST"
echo ""

# OBS rewrites its settings when it closes, so it must be closed now.
while pgrep -xi obs >/dev/null 2>&1; do
  printf "  O OBS está aberto. Feche o OBS e aperte Enter (ou Ctrl+C para sair)... "
  read -r _
done

# Stop a running UltraChat so its files can be replaced.
curl -s -X POST http://127.0.0.1:8787/api/shutdown >/dev/null 2>&1 || true
sleep 1

mkdir -p "$DEST"
# Copy everything except the installer itself; an existing config.json is kept.
for item in "$SRC"/* "$SRC"/.[!.]*; do
  [ -e "$item" ] || continue
  name="$(basename "$item")"
  [ "$name" = "install.sh" ] && continue
  rm -rf "$DEST/$name"
  cp -R "$item" "$DEST/"
done

chmod +x "$DEST/node/bin/node" "$DEST/start.sh" "$DEST/uninstall.sh"
if [ "$(uname -s)" = "Darwin" ]; then
  # Files from a browser download are quarantined; clear that so OBS can start node.
  xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
fi

"$DEST/node/bin/node" "$DEST/tools/configure-obs.js" install

# "UltraChat" app shortcut: opens the panel in its own window (starts the server if needed).
if [ "$(uname -s)" = "Darwin" ]; then
  APP="$HOME/Applications/UltraChat.app"
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
  cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>UltraChat</string>
  <key>CFBundleIdentifier</key><string>io.github.eliezertsilva.ultrachat</string>
  <key>CFBundleExecutable</key><string>UltraChat</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
  printf '#!/bin/sh\nexec "%s/node/bin/node" "%s/tools/app.mjs"\n' "$DEST" "$DEST" > "$APP/Contents/MacOS/UltraChat"
  chmod +x "$APP/Contents/MacOS/UltraChat"
else
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/ultrachat.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=UltraChat
Comment=Configurar o UltraChat
Exec="$DEST/node/bin/node" "$DEST/tools/app.mjs"
Icon=$DEST/public/logo.svg
Terminal=false
Categories=AudioVideo;Utility;
DESKTOP
fi

echo ""
echo "  Pronto! Abra o OBS: o UltraChat liga sozinho e aparecem os docks"
echo "  'UltraChat - Chat' e 'UltraChat - Painel' (menu Painéis/Docks)."
echo "  Para configurar sem o OBS, abra o app 'UltraChat' no menu de aplicativos."
echo ""
echo "  Overlay para a Fonte de Navegador: http://localhost:8787/overlay.html"
echo "  Para desinstalar: sh \"$DEST/uninstall.sh\""
echo ""
