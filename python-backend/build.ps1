$ErrorActionPreference = "Stop"

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue

Set-Location $base

if (-not $pythonCommand) {
    throw "python command not found. Please install Python 3.13 and add it to PATH."
}

$skipPipInstall = ($env:FAPIAO_SKIP_PIP_INSTALL -eq "1")
if (-not $skipPipInstall) {
    & $pythonCommand.Source -m pip install --user `
        -r requirements\base.txt `
        -r requirements\ocr.txt `
        -r requirements\ofd.txt `
        -r requirements\server.txt
}

& $pythonCommand.Source -m PyInstaller build.spec --noconfirm
