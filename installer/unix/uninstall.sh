#!/bin/sh
# UltraChat para OBS — desinstalador para macOS e Linux.
# Uso: sh uninstall.sh
DIR="$(cd "$(dirname "$0")" && pwd)"

while pgrep -xi obs >/dev/null 2>&1; do
  printf "  O OBS está aberto. Feche o OBS e aperte Enter (ou Ctrl+C para sair)... "
  read -r _
done

curl -s -X POST http://127.0.0.1:8787/api/shutdown >/dev/null 2>&1 || true
sleep 1

if [ -x "$DIR/node/bin/node" ]; then
  "$DIR/node/bin/node" "$DIR/tools/configure-obs.js" uninstall
fi

rm -rf "$HOME/Applications/UltraChat.app" 2>/dev/null
rm -f "$HOME/.local/share/applications/ultrachat.desktop" 2>/dev/null

# Safety: only delete a folder that really is an UltraChat install.
if [ -f "$DIR/obs-ultrachat.lua" ] && [ -f "$DIR/src/server.js" ]; then
  rm -rf "$DIR"
  echo "  UltraChat removido."
else
  echo "  Pasta inesperada, nada foi apagado: $DIR"
fi
