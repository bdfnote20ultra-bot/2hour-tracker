param(
  [int]$Port = 8175,
  [string]$HelperUrl = "",
  [int]$ProcessId = 0,
  [string]$ProcessName = "RMG",
  [int]$MaxWidth = 960,
  [int]$IntervalMs = 75,
  [int]$JpegQuality = 52
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($HelperUrl)) {
  $HelperUrl = "http://127.0.0.1:$Port"
}

$IntervalMs = [Math]::Max(45, $IntervalMs)
$MaxWidth = [Math]::Max(320, $MaxWidth)
$JpegQuality = [Math]::Min(86, [Math]::Max(35, $JpegQuality))

Add-Type -AssemblyName System.Drawing

if (-not ("FuitCloudCaptureWin32" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class FuitCloudCaptureWin32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@
}

function Get-TargetProcess {
  if ($ProcessId -gt 0) {
    try {
      $process = Get-Process -Id $ProcessId -ErrorAction Stop
      if ($process.MainWindowHandle -ne 0) { return $process }
    } catch {}
  }

  $named = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1

  return $named
}

function Get-WindowBounds($Process) {
  if (-not $Process -or $Process.MainWindowHandle -eq 0) { return $null }
  $handle = [IntPtr]$Process.MainWindowHandle
  if (-not [FuitCloudCaptureWin32]::IsWindow($handle)) { return $null }
  if (-not [FuitCloudCaptureWin32]::IsWindowVisible($handle)) { return $null }

  $rect = New-Object FuitCloudCaptureWin32+RECT
  if (-not [FuitCloudCaptureWin32]::GetWindowRect($handle, [ref]$rect)) { return $null }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 32 -or $height -lt 32) { return $null }

  [pscustomobject]@{
    Left = $rect.Left
    Top = $rect.Top
    Width = $width
    Height = $height
  }
}

function Get-JpegCodec {
  [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" } |
    Select-Object -First 1
}

function Convert-BitmapToJpegBytes($Bitmap) {
  $stream = New-Object System.IO.MemoryStream
  $encoder = Get-JpegCodec
  $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality,
    [int64]$JpegQuality
  )
  $Bitmap.Save($stream, $encoder, $encoderParams)
  $bytes = $stream.ToArray()
  $stream.Dispose()
  $encoderParams.Dispose()
  return $bytes
}

function Send-HostStatus {
  try {
    Invoke-RestMethod -Uri "$HelperUrl/api/host" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 1 | Out-Null
  } catch {}
}

$lastHostStatus = [DateTime]::MinValue

while ($true) {
  $started = Get-Date
  $process = Get-TargetProcess
  $bounds = Get-WindowBounds $process

  if ($bounds) {
    $sourceBitmap = $null
    $scaledBitmap = $null
    $graphics = $null
    $scaledGraphics = $null

    try {
      $sourceBitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($sourceBitmap)
      $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $sourceBitmap.Size)

      $scale = [Math]::Min(1.0, $MaxWidth / [double]$bounds.Width)
      $scaledWidth = [Math]::Max(2, [int][Math]::Round($bounds.Width * $scale))
      $scaledHeight = [Math]::Max(2, [int][Math]::Round($bounds.Height * $scale))

      if ($scaledWidth -ne $bounds.Width -or $scaledHeight -ne $bounds.Height) {
        $scaledBitmap = New-Object System.Drawing.Bitmap($scaledWidth, $scaledHeight)
        $scaledGraphics = [System.Drawing.Graphics]::FromImage($scaledBitmap)
        $scaledGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Low
        $scaledGraphics.DrawImage($sourceBitmap, 0, 0, $scaledWidth, $scaledHeight)
        $bytes = Convert-BitmapToJpegBytes $scaledBitmap
      } else {
        $bytes = Convert-BitmapToJpegBytes $sourceBitmap
      }

      Invoke-WebRequest -Uri "$HelperUrl/api/frame" -Method Post -ContentType "image/jpeg" -Body $bytes -UseBasicParsing -TimeoutSec 2 | Out-Null

      if (((Get-Date) - $lastHostStatus).TotalSeconds -ge 2) {
        Send-HostStatus
        $lastHostStatus = Get-Date
      }
    } catch {
      Start-Sleep -Milliseconds 120
    } finally {
      if ($scaledGraphics) { $scaledGraphics.Dispose() }
      if ($graphics) { $graphics.Dispose() }
      if ($scaledBitmap) { $scaledBitmap.Dispose() }
      if ($sourceBitmap) { $sourceBitmap.Dispose() }
    }
  } else {
    Start-Sleep -Milliseconds 250
  }

  $elapsed = ((Get-Date) - $started).TotalMilliseconds
  $sleepMs = [Math]::Max(1, $IntervalMs - [int]$elapsed)
  Start-Sleep -Milliseconds $sleepMs
}
