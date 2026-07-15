$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$appEnv = if ($env:APP_ENV) { $env:APP_ENV } else { "dev" }

Push-Location $rootDir
try {
    $env:APP_ENV = $appEnv
    node scripts/build-release.js
} finally {
    Pop-Location
}
