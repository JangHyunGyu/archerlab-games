param(
  [Parameter(Mandatory = $true)][string]$Mode,
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing

function New-TransparentBitmap {
  param([int]$Width, [int]$Height)
  return New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Get-KeyColor {
  param([System.Drawing.Bitmap]$Bitmap)
  $points = @(
    @(0, 0),
    @(($Bitmap.Width - 1), 0),
    @(0, ($Bitmap.Height - 1)),
    @(($Bitmap.Width - 1), ($Bitmap.Height - 1))
  )
  $r = 0
  $g = 0
  $b = 0
  foreach ($point in $points) {
    $pixel = $Bitmap.GetPixel($point[0], $point[1])
    $r += $pixel.R
    $g += $pixel.G
    $b += $pixel.B
  }
  return [System.Drawing.Color]::FromArgb(255, [int]($r / 4), [int]($g / 4), [int]($b / 4))
}

function Remove-ChromaKey {
  param([System.Drawing.Bitmap]$Source)
  $key = Get-KeyColor $Source
  $out = New-TransparentBitmap $Source.Width $Source.Height
  $transparentThreshold = 46.0
  $opaqueThreshold = 145.0
  for ($y = 0; $y -lt $Source.Height; $y += 1) {
    for ($x = 0; $x -lt $Source.Width; $x += 1) {
      $p = $Source.GetPixel($x, $y)
      $dr = [double]$p.R - $key.R
      $dg = [double]$p.G - $key.G
      $db = [double]$p.B - $key.B
      $distance = [Math]::Sqrt($dr * $dr + $dg * $dg + $db * $db)
      if ($distance -le $transparentThreshold) {
        $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        continue
      }

      $alpha = 255
      if ($distance -lt $opaqueThreshold) {
        $t = ($distance - $transparentThreshold) / ($opaqueThreshold - $transparentThreshold)
        $alpha = [int][Math]::Round([Math]::Max(0, [Math]::Min(1, $t)) * 255)
      }

      $r = $p.R
      $g = $p.G
      $b = $p.B
      if ($alpha -lt 252 -and $key.G -gt ($key.R + 64) -and $key.G -gt ($key.B + 64)) {
        $limit = [int]([Math]::Max([int]$r, [int]$b) + 28)
        $g = [int][Math]::Min([int]$g, [Math]::Min(255, $limit))
      } elseif ($alpha -lt 252 -and $key.R -gt ($key.G + 64) -and $key.B -gt ($key.G + 64)) {
        $limit = [int]([Math]::Min(255, [int]$g + 28))
        $r = [int][Math]::Min([int]$r, $limit)
        $b = [int][Math]::Min([int]$b, $limit)
      }
      $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $r, $g, $b))
    }
  }
  return $out
}

function Get-AlphaBounds {
  param([System.Drawing.Bitmap]$Bitmap)
  $minX = $Bitmap.Width
  $minY = $Bitmap.Height
  $maxX = -1
  $maxY = -1
  for ($y = 0; $y -lt $Bitmap.Height; $y += 1) {
    for ($x = 0; $x -lt $Bitmap.Width; $x += 1) {
      if ($Bitmap.GetPixel($x, $y).A -gt 18) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt $minX -or $maxY -lt $minY) {
    return [System.Drawing.Rectangle]::FromLTRB(0, 0, $Bitmap.Width, $Bitmap.Height)
  }
  return [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)
}

function Expand-RectToAspect {
  param(
    [System.Drawing.Rectangle]$Rect,
    [int]$CanvasWidth,
    [int]$CanvasHeight,
    [double]$Aspect,
    [double]$Padding
  )
  $cx = $Rect.X + $Rect.Width / 2.0
  $cy = $Rect.Y + $Rect.Height / 2.0
  $w = $Rect.Width * (1.0 + $Padding)
  $h = $Rect.Height * (1.0 + $Padding)
  if (($w / $h) -lt $Aspect) {
    $w = $h * $Aspect
  } else {
    $h = $w / $Aspect
  }
  $w = [Math]::Min($w, $CanvasWidth)
  $h = [Math]::Min($h, $CanvasHeight)
  $x = [Math]::Max(0, [Math]::Min($CanvasWidth - $w, $cx - $w / 2.0))
  $y = [Math]::Max(0, [Math]::Min($CanvasHeight - $h, $cy - $h / 2.0))
  return New-Object System.Drawing.Rectangle ([int][Math]::Round($x)), ([int][Math]::Round($y)), ([int][Math]::Round($w)), ([int][Math]::Round($h))
}

function Resize-Bitmap {
  param(
    [System.Drawing.Bitmap]$Source,
    [System.Drawing.Rectangle]$SourceRect,
    [int]$Width,
    [int]$Height
  )
  $out = New-TransparentBitmap $Width $Height
  $graphics = [System.Drawing.Graphics]::FromImage($out)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $dest = New-Object System.Drawing.Rectangle 0, 0, $Width, $Height
    $graphics.DrawImage($Source, $dest, $SourceRect, [System.Drawing.GraphicsUnit]::Pixel)
  } finally {
    $graphics.Dispose()
  }
  return $out
}

function Save-Png {
  param([System.Drawing.Bitmap]$Bitmap, [string]$Path)
  $dir = Split-Path -Parent $Path
  if ($dir) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $InputPath))
try {
  $keyed = Remove-ChromaKey $source
  try {
    if ($Mode -eq "walk") {
      $rect = New-Object System.Drawing.Rectangle 0, 0, $keyed.Width, $keyed.Height
      $final = Resize-Bitmap $keyed $rect 1254 1254
      try { Save-Png $final $OutputPath } finally { $final.Dispose() }
    } elseif ($Mode -eq "death") {
      $bounds = Get-AlphaBounds $keyed
      $rect = Expand-RectToAspect $bounds $keyed.Width $keyed.Height 4.0 0.18
      $final = Resize-Bitmap $keyed $rect 2048 512
      try { Save-Png $final $OutputPath } finally { $final.Dispose() }
    } elseif ($Mode -eq "corpse") {
      $base = [System.IO.Path]::Combine((Split-Path -Parent $OutputPath), [System.IO.Path]::GetFileNameWithoutExtension($OutputPath))
      $cellW = [Math]::Floor($keyed.Width / 3)
      for ($i = 0; $i -lt 3; $i += 1) {
        $cell = New-Object System.Drawing.Rectangle ([int]($i * $cellW)), 0, ([int]$cellW), $keyed.Height
        $crop = Resize-Bitmap $keyed $cell 512 360
        try {
          Save-Png $crop ("{0}-{1}.png" -f $base, ($i + 1))
        } finally {
          $crop.Dispose()
        }
      }
    } else {
      throw "Unknown mode: $Mode"
    }
  } finally {
    $keyed.Dispose()
  }
} finally {
  $source.Dispose()
}
