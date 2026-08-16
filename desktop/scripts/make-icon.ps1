$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $Radius * 2
  $path.AddArc($X, $Y, $d, $d, 180, 90)
  $path.AddArc($X + $Width - $d, $Y, $d, $d, 270, 90)
  $path.AddArc($X + $Width - $d, $Y + $Height - $d, $d, $d, 0, 90)
  $path.AddArc($X, $Y + $Height - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

$size = 512
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$bgPath = New-RoundedRectPath 8 8 496 496 96
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)),
  (New-Object System.Drawing.Point(512, 512)),
  [System.Drawing.Color]::FromArgb(11, 15, 26),
  [System.Drawing.Color]::FromArgb(19, 25, 39)
)
$graphics.FillPath($bgBrush, $bgPath)
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(56, 189, 248), 6)
$graphics.DrawPath($borderPen, $bgPath)

$tilePath = New-RoundedRectPath 112 112 288 288 56
$tileBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(112, 112)),
  (New-Object System.Drawing.Point(400, 400)),
  [System.Drawing.Color]::FromArgb(56, 189, 248),
  [System.Drawing.Color]::FromArgb(20, 184, 166)
)
$graphics.FillPath($tileBrush, $tilePath)

$bubblePath = New-RoundedRectPath 171 226 170 118 28
$white = [System.Drawing.Brushes]::White
$graphics.FillPath($white, $bubblePath)
$tailPoints = [System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point(245, 344)),
  (New-Object System.Drawing.Point(271, 344)),
  (New-Object System.Drawing.Point(236, 384))
)
$graphics.FillPolygon($white, $tailPoints)

$dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))
foreach ($x in 216, 246, 276) {
  $graphics.FillEllipse($dotBrush, $x, 280, 16, 16)
}

$sparkPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$sparkPoints = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF(360, 150)),
  (New-Object System.Drawing.PointF(375, 172)),
  (New-Object System.Drawing.PointF(398, 184)),
  (New-Object System.Drawing.PointF(375, 196)),
  (New-Object System.Drawing.PointF(360, 218)),
  (New-Object System.Drawing.PointF(345, 196)),
  (New-Object System.Drawing.PointF(322, 184)),
  (New-Object System.Drawing.PointF(345, 172))
)
$sparkPath.AddPolygon($sparkPoints)
$graphics.FillPath($white, $sparkPath)

$outDir = Join-Path $PSScriptRoot '..\build'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outFile = Join-Path $outDir 'icon.png'
$bitmap.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

$icon256 = New-Object System.Drawing.Bitmap(256, 256)
$graphics256 = [System.Drawing.Graphics]::FromImage($icon256)
$graphics256.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics256.DrawImage($bitmap, 0, 0, 256, 256)
$png256 = Join-Path $outDir 'icon-256.png'
$icon256.Save($png256, [System.Drawing.Imaging.ImageFormat]::Png)

$pngBytes = [System.IO.File]::ReadAllBytes($png256)
$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$pngBytes.Length)
$writer.Write([uint32]22)
$writer.Write($pngBytes)
$icoFile = Join-Path $outDir 'icon.ico'
[System.IO.File]::WriteAllBytes($icoFile, $stream.ToArray())

$graphics.Dispose()
$bitmap.Dispose()
$graphics256.Dispose()
$icon256.Dispose()
$bgPath.Dispose()
$tilePath.Dispose()
$bubblePath.Dispose()
$sparkPath.Dispose()

Write-Output "icon generated: $outFile"
Write-Output "ico generated: $icoFile"
