#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ENV="${APP_ENV:-dev}"

pushd "${ROOT_DIR}" >/dev/null
APP_ENV="${APP_ENV}" node scripts/build-release.js
popd >/dev/null
