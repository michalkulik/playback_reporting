#!/usr/bin/env bash
#
# Build and package the Playback Reporting plugin for a given Jellyfin ABI.
#
#   ./build.sh net9.0    Jellyfin 10.11.x (and 12.x)   (recommended)
#   ./build.sh net10.0   Jellyfin 12.x only
#
# Produces dist/playback_reporting_<version>-<tfm>.zip and prints the matching
# repository manifest entry, including the MD5 checksum Jellyfin expects.
set -euo pipefail

PROJECT="Jellyfin.Plugin.PlaybackReporting/Jellyfin.Plugin.PlaybackReporting.csproj"
PLUGIN_DLL="Jellyfin.Plugin.PlaybackReporting.dll"
# Third-party runtime dependency that is not shipped by the Jellyfin server.
EXTRA_DLLS=("SQLitePCL.pretty.dll")
TFM="${1:-net9.0}"

case "$TFM" in
    net9.0)  TARGET_ABI="10.11.0.0" ;;
    net10.0) TARGET_ABI="12.0.0.0" ;;
    *) echo "Unsupported target framework: $TFM (expected net9.0 or net10.0)" >&2; exit 1 ;;
esac

DOTNET="${DOTNET:-dotnet}"
command -v "$DOTNET" >/dev/null 2>&1 || DOTNET="$HOME/.dotnet/dotnet"

"$DOTNET" build "$PROJECT" -c Release -f "$TFM" --nologo

VERSION=$(sed -nE 's:.*<AssemblyVersion>([^<]+)</AssemblyVersion>.*:\1:p' "$PROJECT" | head -1)
if [ -z "$VERSION" ]; then
    VERSION=$(sed -nE 's:.*<AssemblyVersion>([^<]+)</AssemblyVersion>.*:\1:p' "Directory.Build.props" | head -1)
fi
VERSION="${VERSION:-3.0.0.0}"
OUT_DIR="Jellyfin.Plugin.PlaybackReporting/bin/Release/$TFM"

if [ ! -f "$OUT_DIR/$PLUGIN_DLL" ]; then
    echo "Plugin assembly not found at $OUT_DIR/$PLUGIN_DLL" >&2
    exit 1
fi

mkdir -p dist
ZIP="dist/playback_reporting_${VERSION}-${TFM}.zip"
rm -f "$ZIP"

# Jellyfin expects the plugin assembly at the root of the archive together with
# any third-party dependencies it needs.
"${PYTHON:-python3}" - "$ZIP" "$OUT_DIR" "$PLUGIN_DLL" "${EXTRA_DLLS[@]}" <<'PY'
import os
import sys
import zipfile

dest = sys.argv[1]
out_dir = sys.argv[2]
files = sys.argv[3:]

with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
    for name in files:
        path = os.path.join(out_dir, name)
        if not os.path.isfile(path):
            raise SystemExit("missing dependency: " + path)
        zf.write(path, name)
PY

CHECKSUM=$(md5sum "$ZIP" | cut -d' ' -f1)

cat <<JSON
      {
        "version": "$VERSION",
        "changelog": "Jellyfin 10.11 and 12 support",
        "targetAbi": "$TARGET_ABI",
        "sourceUrl": "https://example.invalid/$(basename "$ZIP")",
        "checksum": "$CHECKSUM",
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.0000000Z)"
      }
JSON

echo
echo "Package: $ZIP ($(stat -c%s "$ZIP") bytes)"
echo "ABI:     $TFM  ->  targetAbi $TARGET_ABI"
echo "md5:     $CHECKSUM"
echo
echo "Upload the zip to a public URL and replace sourceUrl above (or use tools/update-manifest.py)."
