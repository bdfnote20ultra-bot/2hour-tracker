@echo off
setlocal
set "FUIT_CLOUD_GAMING_HOME=T:\FattysLiveTV\Tools\FuitCloudGamingHost"
set "FUIT_CLOUD_GAMING_SCRIPT=%FUIT_CLOUD_GAMING_HOME%\Start-FUIT-Cloud-Gaming.ps1"

if not exist "%FUIT_CLOUD_GAMING_SCRIPT%" (
  echo FUITS Cloud Gaming helper was not found:
  echo %FUIT_CLOUD_GAMING_SCRIPT%
  echo.
  echo Make sure the T drive is plugged in and mounted as T:
  echo Expected helper folder:
  echo %FUIT_CLOUD_GAMING_HOME%
  pause
  exit /b 1
)

cd /d "%FUIT_CLOUD_GAMING_HOME%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FUIT_CLOUD_GAMING_SCRIPT%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FUIT_CLOUD_GAMING_SCRIPT%" -CleanupOnly
if errorlevel 1 (
  echo.
  echo FUITS Cloud Gaming helper stopped with an error.
  pause
)
