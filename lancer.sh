#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Installez Node.js 20 ou plus récent : https://nodejs.org"
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install || exit 1
fi
if [ ! -x node_modules/electron/dist/electron ]; then
  node node_modules/electron/install.js || exit 1
fi
npm start
