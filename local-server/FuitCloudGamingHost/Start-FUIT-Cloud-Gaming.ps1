$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverFile = Join-Path $scriptDir "server.js"
$defaultPort = "8175"

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

function Start-CloudGaming {
  Clear-Host
  Write-Host "FUITS CLOUD GAMING" -ForegroundColor Cyan
  Write-Host "This helper links a PC emulator/game window to the FUIT site."
  Write-Host ""

  $sessionName = Read-WithDefault "Session name" "FUITS Cloud Gaming"
  $gameName = Read-WithDefault "Game label" "PC emulator game"
  $port = Read-WithDefault "Helper port" $defaultPort

  $gamePath = ""
  $openGame = Read-Host "Open an emulator/game now? Y/N [Y]"
  if ([string]::IsNullOrWhiteSpace($openGame) -or $openGame.Trim().ToUpperInvariant().StartsWith("Y")) {
    $gamePath = Select-GameFile
    if ($gamePath) {
      if ($gameName -eq "PC emulator game") {
        $gameName = [System.IO.Path]::GetFileNameWithoutExtension($gamePath)
      }
      Write-Host "Opening $gamePath"
      Start-Process -FilePath $gamePath | Out-Null
    }
  }

  $node = Find-Node

  $env:FUIT_CLOUD_SESSION_NAME = $sessionName
  $env:FUIT_CLOUD_GAME_NAME = $gameName
  $env:FUIT_CLOUD_GAME_PATH = $gamePath
  $env:FUIT_CLOUD_GAMING_PORT = $port

  Clear-Host
  Write-Host "FUITS Cloud Gaming helper is starting..." -ForegroundColor Cyan
  Write-Host "Local viewer: http://127.0.0.1:$port/room"
  Write-Host ""
  Write-Host "Open the FUIT site, choose FUITS CLOUD GAMING, then click Capture PC Game Window."
  Write-Host "Choose the emulator/game window from the browser capture picker."
  Write-Host "Close this window or press Ctrl+C to turn cloud gaming off."
  Write-Host ""

  try {
    & $node $serverFile
  } finally {
    Remove-Item Env:\FUIT_CLOUD_SESSION_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_GAME_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_GAME_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_CLOUD_GAMING_PORT -ErrorAction SilentlyContinue
  }
}

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
    "2" { exit 0 }
    default {
      Write-Host "Choose 1 or 2."
      Start-Sleep -Seconds 1
    }
  }
}
