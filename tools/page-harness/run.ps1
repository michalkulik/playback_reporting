# Offline harness for the plugin's dashboard pages.
#
# Jellyfin 12 removed a number of web APIs the ported pages relied on
# (RequireJS, Dashboard.getConfigurationPageUrl, ...). This harness loads each
# page module in a real browser with small stand-ins for the Jellyfin globals,
# so page initialisation and the API calls they make can be checked without a
# running server.
#
# Usage:
#   pwsh -File tools/page-harness/run.ps1
#   then open http://127.0.0.1:8777/harness.html and run
#     await window.__runPage('user_report')
#   in the browser console (window.__errors / window.__calls report the result).
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pages = Join-Path $here "..\..\Jellyfin.Plugin.PlaybackReporting\Pages"
$work = Join-Path $here "_generated"

New-Item -ItemType Directory -Force -Path $work | Out-Null
Get-ChildItem -Path $work -Recurse -Force | Remove-Item -Recurse -Force

Copy-Item (Join-Path $here "harness.html") $work -Force
Copy-Item (Join-Path $pages "*.html") $work -Force
Copy-Item (Join-Path $pages "*.js") $work -Force
Remove-Item (Join-Path $work "harness.html.tmp") -ErrorAction SilentlyContinue

Write-Host "Serving $work on http://127.0.0.1:8777/harness.html"
Push-Location $work
try {
    python -m http.server 8777 --bind 127.0.0.1
}
finally {
    Pop-Location
}
