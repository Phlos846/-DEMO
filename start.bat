@echo off
REM ASCII only: CMD breaks UTF-8 batch files (garbled text, "level" errors).
cd /d "%~dp0"

where powershell >nul 2>&1
if errorlevel 1 (
  echo ERROR: PowerShell not found.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8765/"
powershell.exe -NoExit -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
exit /b 0
