$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverFile = Join-Path $scriptDir "server.js"
$defaultPort = "8174"
$romsRoot = "T:\FattysLiveTV\Games\Roms"
$gameSystems = @(
  @{ System = "GB"; Core = "gb"; Folder = "GB"; Extensions = @(".gb") },
  @{ System = "GBC"; Core = "gb"; Folder = "GBC"; Extensions = @(".gbc") },
  @{ System = "GBA"; Core = "gba"; Folder = "GBA"; Extensions = @(".gba") },
  @{ System = "N64"; Core = "n64"; Folder = "N64"; Extensions = @(".n64", ".z64", ".v64") },
  @{ System = "PS1"; Core = "psx"; Folder = "PS1"; Extensions = @(".cue", ".chd", ".pbp", ".m3u") }
)

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

function ConvertTo-GameUrlPath([string]$System, [string]$RelativePath) {
  $parts = $RelativePath -split '[\\/]+' | Where-Object { $_ }
  $encoded = ($parts | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join "/"
  return "/games/$System/$encoded"
}

function Get-RelativePath([string]$BaseDir, [string]$FullPath) {
  $base = [System.IO.Path]::GetFullPath($BaseDir).TrimEnd('\') + '\'
  $full = [System.IO.Path]::GetFullPath($FullPath)
  return $full.Substring($base.Length)
}

function Get-AvailableBrowserGames {
  if (-not (Test-Path -LiteralPath $romsRoot)) {
    throw "ROM folder was not found: $romsRoot"
  }

  $games = New-Object System.Collections.Generic.List[object]

  foreach ($config in $gameSystems) {
    $system = $config.System
    $systemDir = Join-Path $romsRoot $config.Folder
    if (-not (Test-Path -LiteralPath $systemDir)) { continue }

    $files = @(Get-ChildItem -LiteralPath $systemDir -Recurse -File -ErrorAction SilentlyContinue)
    $foldersWithM3u = @{}
    foreach ($file in $files) {
      if ($file.Extension.ToLowerInvariant() -eq ".m3u") {
        $foldersWithM3u[$file.DirectoryName] = $true
      }
    }

    foreach ($file in $files) {
      $extension = $file.Extension.ToLowerInvariant()
      if ($config.Extensions -notcontains $extension) { continue }
      if ($system -eq "PS1" -and $extension -ne ".m3u" -and $foldersWithM3u.ContainsKey($file.DirectoryName)) { continue }

      $relativePath = Get-RelativePath $systemDir $file.FullName
      $label = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
      $discUrls = @()
      if ($system -eq "PS1" -and $extension -eq ".m3u") {
        $playlistDir = $file.DirectoryName
        $discUrls = @(Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue |
          ForEach-Object { $_.Trim() } |
          Where-Object { $_ -and -not $_.StartsWith("#") } |
          ForEach-Object {
            $discPath = [System.IO.Path]::GetFullPath((Join-Path $playlistDir $_))
            if ($discPath.StartsWith([System.IO.Path]::GetFullPath($systemDir)) -and (Test-Path -LiteralPath $discPath)) {
              ConvertTo-GameUrlPath $system (Get-RelativePath $systemDir $discPath)
            }
          } |
          Where-Object { $_ })
      }

      $games.Add([PSCustomObject]@{
        label = $label
        system = $system
        core = $config.Core
        file = $file.Name
        fullPath = $file.FullName
        relativePath = $relativePath
        gameUrl = ConvertTo-GameUrlPath $system $relativePath
        discUrls = $discUrls
      }) | Out-Null
    }
  }

  return @($games | Sort-Object system, label)
}

function Select-BrowserGame {
  $games = @(Get-AvailableBrowserGames)
  if (-not $games.Count) {
    throw "No browser emulator ROMs were found under $romsRoot"
  }

  Write-Host ""
  Write-Host "What game would you like to play?" -ForegroundColor Green
  Write-Host "Only games currently found in $romsRoot are shown." -ForegroundColor Yellow
  Write-Host ""

  for ($i = 0; $i -lt $games.Count; $i++) {
    $game = $games[$i]
    Write-Host ("{0}. [{1}] {2}" -f ($i + 1), $game.system, $game.label)
  }

  while ($true) {
    Write-Host ""
    $choice = Read-Host "Press a game number"
    $number = 0
    if ([int]::TryParse($choice, [ref]$number) -and $number -ge 1 -and $number -le $games.Count) {
      return $games[$number - 1]
    }
    Write-Host "Choose a number from 1 to $($games.Count)." -ForegroundColor Yellow
  }
}

function Start-MultiplayerRoom {
  Clear-Host
  Write-Host "FUIT MULTIPLAYER ROOM" -ForegroundColor Green
  Write-Host "This helper is separate from the website. Keep this window open while the room is on."
  Write-Host ""

  $roomName = Read-WithDefault "Room name" "FUIT Multiplayer Room"
  $port = Read-WithDefault "Helper port" $defaultPort

  $selectedGame = Select-BrowserGame
  $gameName = $selectedGame.label
  $gamePath = $selectedGame.fullPath
  $streamUrl = ""

  $node = Find-Node

  $env:FUIT_ROOM_NAME = $roomName
  $env:FUIT_GAME_NAME = $gameName
  $env:FUIT_GAME_PATH = $gamePath
  $env:FUIT_SELECTED_GAME = ($selectedGame | Select-Object label, system, core, file, relativePath, gameUrl, discUrls | ConvertTo-Json -Compress)
  $env:FUIT_STREAM_URL = $streamUrl
  $env:FUIT_MULTIPLAYER_PORT = $port

  Clear-Host
  Write-Host "FUIT Multiplayer helper is starting..." -ForegroundColor Green
  Write-Host "Selected game: $gameName" -ForegroundColor Green
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
    Remove-Item Env:\FUIT_SELECTED_GAME -ErrorAction SilentlyContinue
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
