param(
  [int]$Port = 8175,
  [string]$HelperUrl = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($HelperUrl)) {
  $HelperUrl = "http://127.0.0.1:$Port"
}

if (-not ("FuitCloudInput" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class FuitCloudInput {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  public const uint KEYEVENTF_KEYUP = 0x0002;

  public static void KeyDown(byte vk) {
    keybd_event(vk, 0, 0, UIntPtr.Zero);
  }

  public static void KeyUp(byte vk) {
    keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }
}
"@
}

$buttonToVirtualKey = @{
  "up" = [byte]0x26
  "down" = [byte]0x28
  "left" = [byte]0x25
  "right" = [byte]0x27
  "a" = [byte]0x58
  "b" = [byte]0x5A
  "start" = [byte]0x0D
  "select" = [byte]0xA1
  "l" = [byte]0x41
  "r" = [byte]0x53
  "z" = [byte]0x44
  "c-up" = [byte]0x49
  "c-down" = [byte]0x4B
  "c-left" = [byte]0x4A
  "c-right" = [byte]0x4C
}

$heldKeys = @{}

function Release-AllKeys {
  foreach ($key in @($heldKeys.Keys)) {
    [FuitCloudInput]::KeyUp([byte]$heldKeys[$key])
    $heldKeys.Remove($key)
  }
}

try {
  while ($true) {
    try {
      $state = Invoke-RestMethod -Uri "$HelperUrl/input-state" -Method Get -TimeoutSec 1
      $wantedButtons = @{}

      foreach ($button in @($state.buttons)) {
        $buttonName = [string]$button
        if ($buttonToVirtualKey.ContainsKey($buttonName)) {
          $wantedButtons[$buttonName] = $buttonToVirtualKey[$buttonName]
        }
      }

      foreach ($buttonName in @($wantedButtons.Keys)) {
        if (-not $heldKeys.ContainsKey($buttonName)) {
          $vk = [byte]$wantedButtons[$buttonName]
          [FuitCloudInput]::KeyDown($vk)
          $heldKeys[$buttonName] = $vk
        }
      }

      foreach ($buttonName in @($heldKeys.Keys)) {
        if (-not $wantedButtons.ContainsKey($buttonName)) {
          [FuitCloudInput]::KeyUp([byte]$heldKeys[$buttonName])
          $heldKeys.Remove($buttonName)
        }
      }
    } catch {
      Release-AllKeys
    }

    Start-Sleep -Milliseconds 35
  }
} finally {
  Release-AllKeys
}
