@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or later is required. Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
node "%~dp0sim\server.mjs" %*
