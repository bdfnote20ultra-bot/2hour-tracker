param(
  [int]$ParentProcessId,
  [int]$DelaySeconds = 2
)

$ErrorActionPreference = "SilentlyContinue"

function Stop-FuitCloudGamingProcesses {
  $targets = @()

  try {
    $targets += Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -like "*FuitCloudGamingHost*server.js*" }
  } catch {}

  try {
    $targets += Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
      Where-Object { $_.CommandLine -like "*FuitCloudGamingHost*InputRelay.ps1*" }
  } catch {}

  foreach ($target in ($targets | Where-Object { $_.ProcessId } | Sort-Object ProcessId -Unique)) {
    Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

if ($ParentProcessId -le 0) {
  Stop-FuitCloudGamingProcesses
  exit 0
}

while ($true) {
  $parent = Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue
  if (-not $parent) { break }
  Start-Sleep -Milliseconds 500
}

Start-Sleep -Seconds ([Math]::Max(0, $DelaySeconds))
Stop-FuitCloudGamingProcesses
