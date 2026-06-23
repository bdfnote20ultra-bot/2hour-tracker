param(
  [switch]$CleanupOnly
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverFile = Join-Path $scriptDir "server.js"
$inputRelayFile = Join-Path $scriptDir "InputRelay.ps1"
$autoCaptureFile = Join-Path $scriptDir "AutoCapture.ps1"
$graphicsCaptureFile = Join-Path $scriptDir "GraphicsCapture.py"
$graphicsCapturePydeps = Join-Path $scriptDir "pydeps"
$cleanupWatchdogFile = Join-Path $scriptDir "CleanupWatchdog.ps1"
$defaultPort = "8175"
$defaultRmgPath = "T:\FattysLiveTV\Tools\Emulators\RMG\RMG.exe"
$defaultN64RomRoot = "T:\FattysLiveTV\Games\Roms\N64"

function Find-Node {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }

  $nodeCmd = Get-Command node.cmd -ErrorAction SilentlyContinue
  if ($nodeCmd) { return $nodeCmd.Source }

  throw "Node.js was not found on PATH. Install Node.js or start this from a terminal where node works."
}

function Read-WithDefault([string]$Prompt, [string]$DefaultValue) {
  $value = Read-Host "$Prompt [$DefaultValue]"
  if ([string]::IsNullOrWhiteSpace($value)) { return $DefaultValue }
  return $value.Trim()
}

function Select-GameFile {
  Add-Type -AssemblyName System.Windows.Forms

  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Choose emulator, shortcut, ROM, or game to open"
  $dialog.Filter = "Games and emulators (*.exe;*.lnk;*.bat;*.cmd;*.ps1;*.rom;*.nes;*.sfc;*.smc;*.gb;*.gbc;*.gba;*.n64;*.z64;*.v64;*.iso;*.cue)|*.exe;*.lnk;*.bat;*.cmd;*.ps1;*.rom;*.nes;*.sfc;*.smc;*.gb;*.gbc;*.gba;*.n64;*.z64;*.v64;*.iso;*.cue|All files (*.*)|*.*"
  $dialog.Multiselect = $false

  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    return $dialog.FileName
  }

  return ""
}

function Resolve-GameLaunchPath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $Path }

  $fileName = [System.IO.Path]::GetFileName($Path)
  $knownRmg = "T:\FattysLiveTV\Tools\Emulators\RMG\RMG.exe"

  if ($fileName -ieq "RMG.exe" -and (Test-Path -LiteralPath $knownRmg)) {
    return $knownRmg
  }

  return $Path
}

function Get-CloudGamingStatus([string]$Port) {
  try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/status" -Method Get -TimeoutSec 2
    if ($status.ok -and $status.active) { return $status }
  } catch {
    return $null
  }

  return $null
}

function Stop-FuitCloudGamingProcesses {
  param(
    [int[]]$ExtraProcessIds = @()
  )

  $currentProcessId = $PID
  $targets = @()

  try {
    $targets += Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -like "*FuitCloudGamingHost*server.js*" }
  } catch {}

  try {
    $targets += Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
      Where-Object { $_.CommandLine -like "*FuitCloudGamingHost*InputRelay.ps1*" }
  } catch {}

  try {
    $targets += Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
      Where-Object { $_.CommandLine -like "*FuitCloudGamingHost*AutoCapture.ps1*" }
  } catch {}

  try {
    $targets += Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
      Where-Object { $_.CommandLine -like "*FuitCloudGamingHost*GraphicsCapture.py*" }
  } catch {}

  foreach ($processId in $ExtraProcessIds) {
    if ($processId -and $processId -ne $currentProcessId) {
      $targets += [pscustomobject]@{ ProcessId = $processId }
    }
  }

  foreach ($target in ($targets | Where-Object { $_.ProcessId -and $_.ProcessId -ne $currentProcessId } | Sort-Object ProcessId -Unique)) {
    Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Start-CleanupWatchdog {
  if (-not (Test-Path -LiteralPath $cleanupWatchdogFile)) { return }

  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $cleanupWatchdogFile,
    "-ParentProcessId", $PID,
    "-DelaySeconds", "2"
  ) -WindowStyle Hidden | Out-Null
}

if ($CleanupOnly) {
  Stop-FuitCloudGamingProcesses
  exit 0
}

Start-CleanupWatchdog

function Show-CloudGamingLiveScreen([string]$Port, $Status, [bool]$AlreadyRunning) {
  Clear-Host
  Write-Host "FUITS Cloud Gaming helper is LIVE" -ForegroundColor Green
  Write-Host ""

  if ($AlreadyRunning) {
    Write-Host "A helper is already running on port $Port, so this starter is using that live helper." -ForegroundColor Yellow
    Write-Host ""
  }

  Write-Host "Local viewer: http://127.0.0.1:$Port/room"
  Write-Host "Browser controller: http://127.0.0.1:$Port/controller"

  if ($Status -and $Status.systems -and $Status.systems.N64) {
    Write-Host "N64 launcher: RMG at $($Status.systems.N64.emulatorPath)"
    Write-Host "N64 ROM folder: $($Status.systems.N64.romRoot)"
  }

  Write-Host ""
  Write-Host "Open the FUIT site, choose FUITS CLOUD GAMING, choose N64 + a game, then click Launch N64 Game."
  Write-Host "The stream starts automatically after RMG opens."
  Write-Host "For controller input, keep the emulator window focused on this PC."
  Write-Host ""
  Write-Host "Leave this window open while playing. Press Enter to stop cloud gaming and return to the menu."
  Read-Host | Out-Null
  Stop-FuitCloudGamingProcesses
}

function Start-CloudGaming {
  Clear-Host
  Write-Host "FUITS CLOUD GAMING" -ForegroundColor Cyan
  Write-Host "This helper links a PC emulator/game window to the FUIT site."
  Write-Host ""

  $sessionName = Read-WithDefault "Session name" "FUITS Cloud Gaming"
  $gameName = Read-WithDefault "Game label" "N64 Cloud Gaming"
  $port = Read-WithDefault "Helper port" $defaultPort
  $enableInputRelay = Read-WithDefault "Enable browser controller input relay? Y/N" "Y"
  $rmgPath = Read-WithDefault "RMG emulator path" $defaultRmgPath
  $n64RomRoot = Read-WithDefault "N64 ROM folder" $defaultN64RomRoot

  $gamePath = ""
  $openGame = Read-Host "Open an emulator/game now instead of using the site launcher? Y/N [N]"
  if (-not [string]::IsNullOrWhiteSpace($openGame) -and $openGame.Trim().ToUpperInvariant().StartsWith("Y")) {
    $gamePath = Select-GameFile
    $gamePath = Resolve-GameLaunchPath $gamePath
    if ($gamePath) {
      if ($gameName -eq "PC emulator game") {
        $gameName = [System.IO.Path]::GetFileNameWithoutExtension($gamePath)
      }
      Write-Host "Opening $gamePath"
      Start-Process -FilePath $gamePath | Out-Null
    }
  }

  $node = Find-Node

  $runningStatus = Get-CloudGamingStatus $port
  if ($runningStatus) {
    Show-CloudGamingLiveScreen $port $runningStatus $true
    return
  }

  $env:FUIT_CLOUD_SESSION_NAME = $sessionName
  $env:FUIT_CLOUD_GAME_NAME = $gameName
  $env:FUIT_CLOUD_GAME_PATH = $gamePath
  $env:FUIT_CLOUD_GAMING_PORT = $port
  $env:FUIT_CLOUD_RMG_PATH = $rmgPath
  $env:FUIT_CLOUD_N64_ROM_ROOT = $n64RomRoot
  $env:FUIT_CLOUD_AUTO_CAPTURE_SCRIPT = $autoCaptureFile
  $env:FUIT_CLOUD_GRAPHICS_CAPTURE_SCRIPT = $graphicsCaptureFile
  $env:FUIT_CLOUD_GRAPHICS_CAPTURE_PYDEPS = $graphicsCapturePydeps

  Clear-Host
  Write-Host "FUITS Cloud Gaming helper is starting..." -ForegroundColor Cyan
  Write-Host "Local viewer: http://127.0.0.1:$port/room"
  Write-Host "Browser controller: http://127.0.0.1:$port/controller"
  Write-Host "N64 launcher: RMG at $rmgPath"
  Write-Host "N64 ROM folder: $n64RomRoot"
  Write-Host ""
  Write-Host "Open the FUIT site, choose FUITS CLOUD GAMING, choose N64 + a game, then click Launch N64 Game."
  Write-Host "The stream starts automatically after RMG opens."
  Write-Host "For controller input, keep the emulator window focused on this PC."
  Write-Host "Close this window or press Ctrl+C to turn cloud gaming off."
  Write-Host ""

  $relayProcess = $null
  if ($enableInputRelay.Trim().ToUpperInvariant().StartsWith("Y")) {
    if (Test-Path -LiteralPath $inputRelayFile) {
      $relayProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $inputRelayFile,
        "-Port", $port
      ) -WindowStyle Hidden -PassThru
      Write-Host "Browser controller input relay is running." -ForegroundColor Cyan
    } else {
      Write-Host "Input relay script was not found, so browser controller input is off." -ForegroundColor Yellow
    }
    Write-Host ""
  }

  try {
    & $node $serverFile
    if ($LASTEXITCODE -ne 0) {
      Write-Host ""
      Write-Host "The helper server stopped with exit code $LASTEXITCODE." -ForegroundColor Yellow
      $statusAfterExit = Get-CloudGamingStatus $port
      if ($statusAfterExit) {
        Show-CloudGamingLiveScreen $port $statusAfterExit $true
      } else {
        Write-Host "If this returned to the menu right away, the port may already be in use or Node printed an error above."
        Write-Host "Press Enter to return to the menu."
        Read-Host | Out-Null
      }
    }
  } finally {
    $extraProcessIds = @()
    if ($relayProcess) { $extraProcessIds += $relayProcess.Id }
    Stop-FuitCloudGamingProcesses -ExtraProcessIds $extraProcessIds
    Remove-Item Env:\FUIT_CLOUD_SESSION_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_GAME_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_GAME_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_GAMING_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_RMG_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_N64_ROM_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_AUTO_CAPTURE_SCRIPT -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_GRAPHICS_CAPTURE_SCRIPT -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_GRAPHICS_CAPTURE_PYDEPS -ErrorAction SilentlyContinue
  }
}

try {
  while ($true) {
    Clear-Host
    Write-Host "FUITS CLOUD GAMING HELPER" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Start Cloud Gaming"
    Write-Host "2. Exit"
    Write-Host ""

    $choice = Read-Host "Choose an option"
    switch ($choice) {
      "1" { Start-CloudGaming }
      "2" {
        Stop-FuitCloudGamingProcesses
        exit 0
      }
      default {
        Write-Host "Choose 1 or 2."
        Start-Sleep -Seconds 1
      }
    }
  }
} finally {
  Stop-FuitCloudGamingProcesses
}
