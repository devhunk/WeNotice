@echo off
setlocal
cd /d "%~dp0source" || exit /b 1
echo Close WeNotice from its tray menu before packaging.
call npm run dist:win
if errorlevel 1 (
  echo Packaging failed. Check the error above.
  pause
  exit /b 1
)
echo Output: %~dp0releases
pause
