Add-Type -AssemblyName System.Drawing
$resourceRoot = Join-Path $PSScriptRoot '../android/app/src/main/res'
$previewRoot = Join-Path $PSScriptRoot '../assets'
New-Item -ItemType Directory -Path $previewRoot -Force | Out-Null

function Write-FocusIcon([string]$Path, [int]$Size, [bool]$Foreground, [bool]$Round) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $blue = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#356FB0'))
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 4)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    try {
        if (!$Foreground) {
            if ($Round) { $graphics.FillEllipse($blue, 0, 0, $Size, $Size) }
            else { $graphics.FillRectangle($blue, 0, 0, $Size, $Size) }
        }
        $graphics.ScaleTransform(($Size / 108.0), ($Size / 108.0))
        if (!$Foreground) {
            $graphics.TranslateTransform(54, 54)
            $graphics.ScaleTransform(1.35, 1.35)
            $graphics.TranslateTransform(-54, -54)
        }
        foreach ($coordinates in @(
            @(44, 34, 34, 34, 34, 44),
            @(64, 34, 74, 34, 74, 44),
            @(74, 64, 74, 74, 64, 74),
            @(44, 74, 34, 74, 34, 64)
        )) {
            $points = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new($coordinates[0], $coordinates[1]),
                [System.Drawing.PointF]::new($coordinates[2], $coordinates[3]),
                [System.Drawing.PointF]::new($coordinates[4], $coordinates[5])
            )
            $graphics.DrawLines($pen, $points)
        }
        $graphics.FillEllipse($white, 48, 48, 12, 12)
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $pen.Dispose()
        $white.Dispose()
        $blue.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

foreach ($density in @(
    @{ Name = 'mdpi'; Size = 48; Foreground = 108 },
    @{ Name = 'hdpi'; Size = 72; Foreground = 162 },
    @{ Name = 'xhdpi'; Size = 96; Foreground = 216 },
    @{ Name = 'xxhdpi'; Size = 144; Foreground = 324 },
    @{ Name = 'xxxhdpi'; Size = 192; Foreground = 432 }
)) {
    $directory = Join-Path $resourceRoot ('mipmap-' + $density.Name)
    Write-FocusIcon (Join-Path $directory 'ic_launcher.png') $density.Size $false $false
    Write-FocusIcon (Join-Path $directory 'ic_launcher_round.png') $density.Size $false $true
    Write-FocusIcon (Join-Path $directory 'ic_launcher_foreground.png') $density.Foreground $true $false
}
Write-FocusIcon (Join-Path $previewRoot 'focus-icon.png') 1024 $false $false
