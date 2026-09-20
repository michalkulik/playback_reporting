# Offline harness for the section tab strip (Playback Reporting has nine tabs, which
# overflow the header on narrow screens).
#
# It rebuilds the header tab markup Jellyfin renders (maintabsmanager.js) and loads the
# real, served Jellyfin stylesheet, then lets you measure whether the strip scrolls.
# No CustomElements polyfill is loaded on purpose, which reproduces the mobile wrapper
# where Jellyfin's own scroller is never created.
#
# Usage:
#   pwsh -File tools/tab-harness/run.ps1 -ServerUrl http://192.168.69.11:8097
#   open http://127.0.0.1:8779/index.html
#
# Then in the browser console (or Playwright):
#   __measure()    -> sizes and overflow of the strip
#   __canScroll()  -> how far the strip scrolled (0 means it cannot scroll)
#   __applyFix()   -> add the classes fixTabsBar() adds, then __canScroll() again
param(
    [string]$ServerUrl = "http://192.168.69.11:8097",
    [int]$Port = 8779
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$work = Join-Path $here "_generated"

New-Item -ItemType Directory -Force -Path $work | Out-Null
Get-ChildItem -Path $work -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force

# The tab layout rules (.sectionTabs, .headerTabs, .scrollX) live in the main bundle.
$web = "$ServerUrl/web/"
Write-Host "Fetching the served stylesheet list from $web"
$index = (& curl.exe -s $web) -join "`n"
$css = [regex]::Matches($index, '([A-Za-z0-9_.\-]+\.css)') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique

if (-not $css) {
    throw "No CSS bundles found at $web - is the Jellyfin URL correct and reachable?"
}

foreach ($name in $css) {
    $target = Join-Path $work $name
    & curl.exe -s -o $target "$web$name"
    if ((Get-Item $target).Length -eq 0) {
        throw "Failed to download $web$name"
    }
    Write-Host ("  {0} ({1} bytes)" -f $name, (Get-Item $target).Length)
}

$mainCss = $css | Where-Object { $_ -like 'main.jellyfin.*' } | Select-Object -First 1
if (-not $mainCss) {
    throw "Could not identify the main Jellyfin stylesheet in: $($css -join ', ')"
}

Copy-Item (Join-Path $here "index.html") (Join-Path $work "index.html") -Force
(Get-Content (Join-Path $work "index.html") -Raw) `
    -replace 'main\.jellyfin\.[A-Za-z0-9]+\.css', $mainCss `
    | Set-Content (Join-Path $work "index.html")

Write-Host ""
Write-Host "Serving $work on http://127.0.0.1:$Port/index.html"
Push-Location $work
try {
    python -m http.server $Port --bind 127.0.0.1
}
finally {
    Pop-Location
}
