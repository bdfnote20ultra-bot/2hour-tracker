@echo off
setlocal
set "FUIT_MULTIPLAYER_HOME=T:\FattysLiveTV\Tools\FuitMultiplayerHost"
set "FUIT_MULTIPLAYER_SCRIPT=%FUIT_MULTIPLAYER_HOME%\Start-FUIT-Multiplayer.ps1"

if not exist "%FUIT_MULTIPLAYER_SCRIPT%" (
  echo FUIT Multiplayer helper was not found:
  echo %FUIT_MULTIPLAYER_SCRIPT%
  echo.
  echo Make sure the T drive is plugged in and mounted as T:
  echo Expected helper folder:
  echo %FUIT_MULTIPLAYER_HOME%
  pause
  exit /b 1
)

cd /d "%FUIT_MULTIPLAYER_HOME%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FUIT_MULTIPLAYER_SCRIPT%"
if errorlevel 1 (
  echo.
  echo FUIT Multiplayer helper stopped with an error.
  pause
)
