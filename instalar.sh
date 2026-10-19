#!/usr/bin/env sh
# Instalador del Asistente de tareas (Linux y macOS): ./instalar.sh
set -e
if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js 20 o más nuevo. Instalalo desde https://nodejs.org y volvé a ejecutar este instalador."
  exit 1
fi
exec node "$(dirname "$0")/bin/asistente.mjs" instalar "$@"
