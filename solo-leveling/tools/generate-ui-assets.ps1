param(
    [string]$OutDir = (Join-Path $PSScriptRoot '..\assets\ui')
)

Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-Color([int]$hex, [int]$alpha = 255) {
    return [System.Drawing.Color]::FromArgb(
        $alpha,
        (($hex -shr 16) -band 255),
        (($hex -shr 8) -band 255),
        ($hex -band 255)
    )
}

function New-PanelPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$cut) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.StartFigure()
    $path.AddLine($x + $cut, $y, $x + $w - $cut, $y)
    $path.AddLine($x + $w - $cut, $y, $x + $w, $y + $cut)
    $path.AddLine($x + $w, $y + $cut, $x + $w, $y + $h - $cut)
    $path.AddLine($x + $w, $y + $h - $cut, $x + $w - $cut, $y + $h)
    $path.AddLine($x + $w - $cut, $y + $h, $x + $cut, $y + $h)
    $path.AddLine($x + $cut, $y + $h, $x, $y + $h - $cut)
    $path.AddLine($x, $y + $h - $cut, $x, $y + $cut)
    $path.AddLine($x, $y + $cut, $x + $cut, $y)
    $path.CloseFigure()
    return $path
}

function Draw-Line($g, [float]$x1, [float]$y1, [float]$x2, [float]$y2, [int]$color, [int]$alpha, [float]$width = 1) {
    $pen = [System.Drawing.Pen]::new((New-Color $color $alpha), $width)
    $g.DrawLine($pen, $x1, $y1, $x2, $y2)
    $pen.Dispose()
}

function Draw-Diamond($g, [float]$cx, [float]$cy, [float]$s, [int]$color, [int]$alpha) {
    $diamond = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diamond.AddPolygon(@(
        [System.Drawing.PointF]::new($cx, $cy - $s),
        [System.Drawing.PointF]::new($cx + $s, $cy),
        [System.Drawing.PointF]::new($cx, $cy + $s),
        [System.Drawing.PointF]::new($cx - $s, $cy)
    ))
    $brush = [System.Drawing.SolidBrush]::new((New-Color $color $alpha))
    $g.FillPath($brush, $diamond)
    $brush.Dispose()
    $diamond.Dispose()
}

function Draw-PanelAsset(
    [string]$Name,
    [int]$Width,
    [int]$Height,
    [int]$Border,
    [int]$Accent,
    [int]$FillTop = 0x12253a,
    [int]$FillBottom = 0x040812,
    [int]$Cut = 24,
    [int]$Glow = 18,
    [int]$BorderWidth = 2
) {
    $bmp = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(12, [Math]::Ceiling($Glow * 0.7))
    $x = $pad
    $y = $pad
    $w = $Width - $pad * 2
    $h = $Height - $pad * 2
    $cutPx = [Math]::Min($Cut, [Math]::Floor([Math]::Min($w, $h) * 0.28))
    $path = New-PanelPath $x $y $w $h $cutPx

    for ($i = $Glow; $i -ge 3; $i -= 3) {
        $alpha = [Math]::Max(8, [Math]::Floor(42 * ($i / [Math]::Max($Glow, 1))))
        $pen = [System.Drawing.Pen]::new((New-Color $Border $alpha), $i)
        $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
        $g.DrawPath($pen, $path)
        $pen.Dispose()
    }

    $rect = [System.Drawing.RectangleF]::new($x, $y, $w, $h)
    $fillBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $rect,
        (New-Color $FillTop 234),
        (New-Color $FillBottom 246),
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $g.FillPath($fillBrush, $path)
    $fillBrush.Dispose()

    $state = $g.Save()
    $g.SetClip($path)

    $accentBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.RectangleF]::new($x, $y, $w, $h),
        (New-Color $Accent 76),
        (New-Color $Accent 0),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    $g.FillRectangle($accentBrush, $x, $y, $w, $h)
    $accentBrush.Dispose()

    $shineBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.RectangleF]::new($x, $y, $w, [Math]::Max(2, $h * 0.35)),
        [System.Drawing.Color]::FromArgb(48, 255, 255, 255),
        [System.Drawing.Color]::FromArgb(0, 255, 255, 255),
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $g.FillRectangle($shineBrush, $x + 2, $y + 2, $w - 4, [Math]::Max(2, $h * 0.35))
    $shineBrush.Dispose()

    for ($scanY = $y + 6; $scanY -lt $y + $h; $scanY += 7) {
        Draw-Line $g $x $scanY ($x + $w) $scanY $Accent 14 1
    }
    for ($gridX = $x + 18; $gridX -lt $x + $w; $gridX += 42) {
        Draw-Line $g $gridX $y $gridX ($y + $h) $Accent 10 1
    }

    $g.Restore($state)

    $inner = New-PanelPath ($x + 4) ($y + 4) ($w - 8) ($h - 8) ([Math]::Max(0, $cutPx - 4))
    $innerPen = [System.Drawing.Pen]::new((New-Color $Border 58), 1)
    $innerPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
    $g.DrawPath($innerPen, $inner)
    $innerPen.Dispose()
    $inner.Dispose()

    $borderPen = [System.Drawing.Pen]::new((New-Color $Border 230), $BorderWidth)
    $borderPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
    $g.DrawPath($borderPen, $path)
    $borderPen.Dispose()

    $cornerLen = [Math]::Min(34, [Math]::Max(12, [Math]::Floor([Math]::Min($w, $h) * 0.18)))
    $cornerPen = [System.Drawing.Pen]::new((New-Color $Border 235), [Math]::Max(2, $BorderWidth))
    $g.DrawLine($cornerPen, $x + $cutPx, $y, $x + $cutPx + $cornerLen, $y)
    $g.DrawLine($cornerPen, $x, $y + $cutPx, $x, $y + $cutPx + $cornerLen)
    $g.DrawLine($cornerPen, $x + $w - $cutPx, $y, $x + $w - $cutPx - $cornerLen, $y)
    $g.DrawLine($cornerPen, $x + $w, $y + $cutPx, $x + $w, $y + $cutPx + $cornerLen)
    $g.DrawLine($cornerPen, $x + $w, $y + $h - $cutPx, $x + $w, $y + $h - $cutPx - $cornerLen)
    $g.DrawLine($cornerPen, $x + $w - $cutPx, $y + $h, $x + $w - $cutPx - $cornerLen, $y + $h)
    $g.DrawLine($cornerPen, $x + $cutPx, $y + $h, $x + $cutPx + $cornerLen, $y + $h)
    $g.DrawLine($cornerPen, $x, $y + $h - $cutPx, $x, $y + $h - $cutPx - $cornerLen)
    $cornerPen.Dispose()

    Draw-Diamond $g ($x + $w - 10) ($y + 10) 5 $Border 220
    Draw-Diamond $g ($x + 10) ($y + $h - 10) 5 $Border 220

    $path.Dispose()
    $file = Join-Path $OutDir "$Name.png"
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Draw-PanelAsset 'ui_panel_cyan'     768 288 0x4dd2ff 0x4dd2ff 0x102338 0x030812 28 20 2
Draw-PanelAsset 'ui_panel_gold'     768 288 0xe8b64a 0xe8b64a 0x241a08 0x05060a 28 20 2
Draw-PanelAsset 'ui_panel_red'      768 288 0xff3344 0xff5a5a 0x27090d 0x070306 28 22 2
Draw-PanelAsset 'ui_panel_purple'   768 288 0xb366ff 0x7b2fff 0x180a2f 0x04020a 28 22 2
Draw-PanelAsset 'ui_card_cyan'      384 512 0x4dd2ff 0x4dd2ff 0x10243a 0x040814 30 22 2
Draw-PanelAsset 'ui_card_gold'      384 512 0xe8b64a 0xffd36a 0x231808 0x050608 30 24 2
Draw-PanelAsset 'ui_card_hover'     384 512 0x7be3ff 0x4dd2ff 0x162e48 0x050a16 30 26 3
Draw-PanelAsset 'ui_button_cyan'    224 96  0x4dd2ff 0x4dd2ff 0x102338 0x040814 18 16 2
Draw-PanelAsset 'ui_button_hover'   224 96  0x8cecff 0x4dd2ff 0x183957 0x06101d 18 20 3
Draw-PanelAsset 'ui_slot'           112 112 0x1f5c8f 0x4dd2ff 0x0b1725 0x02050a 12 12 2
Draw-PanelAsset 'ui_minimap'        192 192 0x4dd2ff 0x4dd2ff 0x0a1b2b 0x02060c 18 18 2

Write-Host "Generated UI assets in $OutDir"
