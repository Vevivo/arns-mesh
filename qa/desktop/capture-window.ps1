# Capture the actual packaged Electron window on the isolated Windows runner.
param([int]$AppPid,[string]$OutputPath)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CaptureBounds {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
'@
$process = Get-Process -Id $AppPid
$handle = $process.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { throw 'The packaged application has no native window.' }
$rect = New-Object CaptureBounds+RECT
if (-not [CaptureBounds]::GetWindowRect($handle, [ref]$rect)) { throw 'Window bounds unavailable.' }
$bitmap = New-Object System.Drawing.Bitmap ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
 $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
 $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
