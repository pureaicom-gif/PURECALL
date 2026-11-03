#!/bin/sh
# PURE Node launcher (Linux/macOS). First time: see docs/PURE-NODE.md
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "install Node.js 24 first"; exit 1; }
[ -d node_modules ] || npm ci --omit=dev || exit 1
[ $# -eq 0 ] && set -- run
exec node scripts/pure-node.mjs "$@"
