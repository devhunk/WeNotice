@echo off
setlocal
set "APP_PATH=%~dp0releases\win-unpacked\WeNotice.exe"
if not exist "%APP_PATH%" (
  echo WeNotice.exe was not found. Build the project first.
  pause
  exit /b 1
)
start "" "%APP_PATH%"
