$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverFile = Join-Path $scriptDir "server.js"
$defaultPort = "8174"

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
  $dialog.Title = "Choose a game, emulator, shortcut, or app to start"
  $dialog.Filter = "Games and apps (*.exe;*.lnk;*.bat;*.cmd;*.ps1;*.rom;*.nes;*.sfc;*.smc;*.gb;*.gbc;*.gba;*.n64;*.z64;*.v64;*.iso;*.cue)|*.exe;*.lnk;*.bat;*.cmd;*.ps1;*.rom;*.nes;*.sfc;*.smc;*.gb;*.gbc;*.gba;*.n64;*.z64;*.v64;*.iso;*.cue|All files (*.*)|*.*"
  $dialog.Multiselect = $false

  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    return $dialog.FileName
  }

  return ""
}

function Start-MultiplayerRoom {
  Clear-Host
  Write-Host "FUIT MULTIPLAYER ROOM" -ForegroundColor Green
  Write-Host "This helper is separate from the website. Keep this window open while the room is on."
  Write-Host ""

  $roomName = Read-WithDefault "Room name" "FUIT Multiplayer Room"
  $gameName = Read-WithDefault "Room game label" "Any game you choose"
  $port = Read-WithDefault "Helper port" $defaultPort

  $gamePath = ""
  Write-Host ""
  Write-Host "Browser emulator games are picked on the FUIT site, not from this helper." -ForegroundColor Yellow
  Write-Host "This next prompt is only for opening an outside PC game/app if you want one." -ForegroundColor Yellow
  $openGame = Read-Host "Open an outside game/app now? Y/N [N]"
  if (-not [string]::IsNullOrWhiteSpace($openGame) -and $openGame.Trim().ToUpperInvariant().StartsWith("Y")) {
    $gamePath = Select-GameFile
    if ($gamePath) {
      if ($gameName -eq "Any game you choose") {
        $gameName = [System.IO.Path]::GetFileNameWithoutExtension($gamePath)
      }
      Write-Host "Opening $gamePath"
      Start-Process -FilePath $gamePath | Out-Null
    }
  }

  Write-Host ""
  Write-Host "Optional: paste a browser-viewable stream URL for the FUIT box." -ForegroundColor Yellow
  Write-Host "Leave blank for now if you have not set up the stream yet."
  $streamUrl = Read-Host "Stream URL"

  $node = Find-Node

  $env:FUIT_ROOM_NAME = $roomName
  $env:FUIT_GAME_NAME = $gameName
  $env:FUIT_GAME_PATH = $gamePath
  $env:FUIT_STREAM_URL = $streamUrl
  $env:FUIT_MULTIPLAYER_PORT = $port

  Clear-Host
  Write-Host "FUIT Multiplayer helper is starting..." -ForegroundColor Green
  Write-Host "Local room: http://127.0.0.1:$port/room"
  Write-Host "Controller: http://127.0.0.1:$port/controller"
  Write-Host ""
  Write-Host "Open the FUIT site, choose FUIT MULTIPLAYER, and it should light up automatically."
  Write-Host "NOTE: The live Vercel site only gets new FUIT Multiplayer code after you commit + push to GitHub." -ForegroundColor Yellow
  Write-Host "If you are testing before pushing, use the local React dev site instead of the live site." -ForegroundColor Yellow
  Write-Host "Close this window or press Ctrl+C to turn the room off."
  Write-Host ""

  try {
    & $node $serverFile
  } finally {
    Remove-Item Env:\FUIT_ROOM_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_GAME_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_GAME_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_STREAM_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\FUIT_MULTIPLAYER_PORT -ErrorAction SilentlyContinue
  }
}

while ($true) {
  Clear-Host
  Write-Host "FUIT MULTIPLAYER HELPER" -ForegroundColor Green
  Write-Host ""
  Write-Host "1. Start Multiplayer Room"
  Write-Host "2. Exit"
  Write-Host ""

  $choice = Read-Host "Choose an option"
  switch ($choice) {
    "1" { Start-MultiplayerRoom }
    "2" { exit 0 }
    default {
      Write-Host "Choose 1 or 2."
      Start-Sleep -Seconds 1
    }
  }
}
