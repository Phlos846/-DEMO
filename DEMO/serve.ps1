# Local HTTP server for the game (ASCII messages = safe in any console code page)
$ErrorActionPreference = "Continue"
Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Autumn recruitment game - local server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Folder: $PWD"
Write-Host "Open in browser: http://127.0.0.1:8765"
Write-Host "Stop server: press Ctrl+C in this window"
Write-Host ""

try {
    Start-Process "http://127.0.0.1:8765/" -ErrorAction SilentlyContinue | Out-Null
} catch {}

function Run-Server {
    param([string]$Exe, [string[]]$ArgList)
    Write-Host "[run] $Exe $($ArgList -join ' ')" -ForegroundColor Green
    Write-Host ""
    & $Exe @ArgList
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    Run-Server "py" @("-3", "-m", "http.server", "8765")
    Write-Host ""
    Write-Host "Server stopped."
    Read-Host "Press Enter to close"
    exit 0
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    Run-Server "python" @("-m", "http.server", "8765")
    Write-Host ""
    Write-Host "Server stopped."
    Read-Host "Press Enter to close"
    exit 0
}

if (Get-Command python3 -ErrorAction SilentlyContinue) {
    Run-Server "python3" @("-m", "http.server", "8765")
    Write-Host ""
    Write-Host "Server stopped."
    Read-Host "Press Enter to close"
    exit 0
}

Write-Host "ERROR: No py / python / python3 in PATH." -ForegroundColor Red
Write-Host "Install Python 3 from https://www.python.org/downloads/"
Write-Host "Check 'Add python.exe to PATH' during setup."
Write-Host "Or disable Store app aliases for python in Windows Settings."
Write-Host ""
Read-Host "Press Enter to close"
exit 1
