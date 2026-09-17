#!/usr/bin/env python3
"""Add or update a Playback Reporting release in a Jellyfin plugin repository manifest.

Usage:
    update-manifest.py --manifest manifest.json \
        --zip dist/playback_reporting_3.0.0.0-net9.0.zip \
        --repo michalkulik/playback_reporting --tag v3.0.0.0 --tfm net9.0 \
        --target-abi 10.11.0.0 --changelog "..."

Jellyfin expects the manifest checksum to be the MD5 of the zip file, and the
download URL to point at the actual zip. The zip is uploaded as a GitHub Release
asset, so the URL follows the /releases/download/<tag>/<file> pattern.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone

PLUGIN_GUID = "9e6eb40f-9a1a-4ca1-a299-62b4d252453e"

PACKAGE_TEMPLATE = {
    "guid": PLUGIN_GUID,
    "name": "Playback Reporting",
    "description": "Show reports for playback activity",
    "overview": "Collect and show user play statistics",
    "owner": "michalkulik",
    "category": "Administration",
    "versions": [],
}


def md5_of(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def version_key(entry):
    return tuple(int(p) for p in entry["version"].split("."))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--zip", required=True)
    ap.add_argument("--repo", required=True, help="GitHub owner/name")
    ap.add_argument("--tag", required=True, help="Release tag, e.g. v3.0.0.0")
    ap.add_argument("--tfm", required=True, help="net9.0 or net10.0")
    ap.add_argument("--target-abi", required=True, help="Minimum Jellyfin version")
    ap.add_argument("--version", help="Plugin version; defaults to the tag without 'v'")
    ap.add_argument("--changelog", default="")
    ap.add_argument(
        "--base-url",
        help="Override the download base URL (default: GitHub Releases for --repo/--tag)",
    )
    args = ap.parse_args()

    version = args.version or args.tag.lstrip("v")
    zip_name = os.path.basename(args.zip)
    checksum = md5_of(args.zip)
    base_url = args.base_url or f"https://github.com/{args.repo}/releases/download/{args.tag}"
    source_url = f"{base_url.rstrip('/')}/{zip_name}"

    if os.path.exists(args.manifest):
        with open(args.manifest) as fh:
            content = json.load(fh) or []
    else:
        content = []

    if not isinstance(content, list):
        raise SystemExit("manifest.json must contain a JSON array of packages")

    package = next(
        (p for p in content if str(p.get("guid", "")).lower() == PLUGIN_GUID), None
    )
    if package is None:
        package = dict(PACKAGE_TEMPLATE, versions=[])
        content.append(package)

    # Keep any other fields the repository owner may have customised.
    for key, value in PACKAGE_TEMPLATE.items():
        package.setdefault(key, value)

    entry = {
        "version": version,
        "changelog": args.changelog or f"Build for {args.tfm}",
        "targetAbi": args.target_abi,
        "sourceUrl": source_url,
        "checksum": checksum,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.0000000Z"),
    }

    # A version may be published for several ABIs (net9.0 + net10.0); keep them apart.
    versions = [
        v
        for v in package["versions"]
        if not (v.get("version") == version and v.get("targetAbi") == args.target_abi)
    ]
    versions.append(entry)
    versions.sort(key=version_key, reverse=True)
    package["versions"] = versions

    with open(args.manifest, "w") as fh:
        json.dump(content, fh, indent=2)
        fh.write("\n")

    print(f"manifest: {args.manifest}")
    print(f"  version  : {version} ({args.tfm}, targetAbi {args.target_abi})")
    print(f"  sourceUrl: {source_url}")
    print(f"  checksum : {checksum}")


if __name__ == "__main__":
    main()
