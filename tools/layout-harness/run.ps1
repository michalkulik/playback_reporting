# Offline layout harness: reproduces Jellyfin's plugin-page layout with the real, served
# stylesheet, so report-table clipping/scrolling on narrow screens can be measured.
#
#   pwsh -File tools/layout-harness/run.ps1 -ServerUrl http://192.168.69.11:8097
#   open http://127.0.0.1:8780/index.html
#
# Playwright / console helpers (after __runPage('<page>')):
#   __measureOverflow('#user_report_results') -> per-ancestor clipping + scrollability
#   __measureTables()                         -> per-table scroller state
param(
    [string]$ServerUrl = "http://192.168.69.11:8097",
    [int]$Port = 8780
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pages = Join-Path $here "..\..\Jellyfin.Plugin.PlaybackReporting\Pages"
$work = Join-Path $here "_generated"

New-Item -ItemType Directory -Force -Path $work | Out-Null
Get-ChildItem -Path $work -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force

$web = "$ServerUrl/web/"
Write-Host "Fetching the served stylesheet list from $web"
$index = (& curl.exe -s $web) -join "`n"
$css = [regex]::Matches($index, '([A-Za-z0-9_.\-]+\.css)') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
if (-not $css) { throw "No CSS bundles found at $web" }

foreach ($name in $css) {
    & curl.exe -s -o (Join-Path $work $name) "$web$name"
    Write-Host ("  {0} ({1} bytes)" -f $name, (Get-Item (Join-Path $work $name)).Length)
}

$mainCss = $css | Where-Object { $_ -like 'main.jellyfin.*' } | Select-Object -First 1
if (-not $mainCss) { throw "No main.jellyfin.*.css in: $($css -join ', ')" }

(Get-Content (Join-Path $here "index.html") -Raw) -replace '__MAIN_CSS__', $mainCss |
    Set-Content (Join-Path $work "index.html")

Copy-Item (Join-Path $pages "*.html") $work -Force
Copy-Item (Join-Path $pages "*.js") $work -Force

Write-Host ""
Write-Host "Serving $work on http://127.0.0.1:$Port/index.html"
Push-Location $work
try {
    python -m http.server $Port --bind 127.0.0.1
}
finally {
    Pop-Location
}
