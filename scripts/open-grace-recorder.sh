#!/usr/bin/env bash
# Start the Open Grace recorder. Node 18+ is enough. No npm install.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 18+ (Ubuntu: sudo apt install nodejs)." >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 && [[ ! -x /usr/bin/ffmpeg ]]; then
  echo "Install ffmpeg (Debian/Ubuntu: sudo apt install ffmpeg)." >&2
  exit 1
fi
if ! command -v yt-dlp >/dev/null 2>&1 && [[ ! -x /usr/local/bin/yt-dlp ]]; then
  echo "Install yt-dlp: sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp" >&2
  exit 1
fi

HUB="${OGM_HUB_URL:-https://open-grace-music2.onrender.com}"
if [[ "${1:-}" == "--install-service" ]]; then
  exec node recorder/worker.mjs --hub "$HUB" --install-service
fi
exec node recorder/worker.mjs --hub "$HUB" "$@"
