#!/bin/sh
# Starts the UltraChat server in the background (macOS / Linux).
# Used by the OBS script; can also be run by hand.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

# Installed version ships its own node; a source checkout uses the system one.
NODE="$DIR/node/bin/node"
if [ ! -x "$NODE" ]; then
  NODE="$(command -v node 2>/dev/null)"
fi
if [ -z "$NODE" ]; then
  echo "Node.js não encontrado. Instale em https://nodejs.org" > "$DIR/ultrachat.log"
  exit 1
fi

if [ ! -d "$DIR/node_modules" ]; then
  npm install --omit=dev >> "$DIR/ultrachat.log" 2>&1
fi

nohup "$NODE" --no-warnings src/server.js > "$DIR/ultrachat.log" 2>&1 &
