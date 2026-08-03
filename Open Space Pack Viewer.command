#!/bin/zsh

set -e

APP_DIR="${0:A:h}"
PORT="4173"
URL="http://127.0.0.1:${PORT}"

cd "$APP_DIR"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" && -x "/Users/shanebaker/.local/node/bin/node" ]]; then
  NODE_BIN="/Users/shanebaker/.local/node/bin/node"
fi

if [[ -z "$NODE_BIN" ]]; then
  osascript -e 'display dialog "Node.js is needed to open 3D Asset Viewer." with title "3D Asset Viewer" buttons {"OK"} default button "OK"'
  exit 1
fi

if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  nohup "$NODE_BIN" server.js > "$APP_DIR/.asset-viewer.log" 2>&1 &
  sleep 0.4
fi

open "$URL"
