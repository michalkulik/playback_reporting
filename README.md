# Playback Reporting (Jellyfin)

Jellyfin plugin that collects and shows user play statistics, ported from the original Emby plugin.
It adds a **Playback Reporting** tab to the dashboard (Plugins section) with the same reports and
configuration options as the Emby original.

## Supported Jellyfin versions

| Jellyfin | Server runtime | Plugin build | Works |
| -------- | -------------- | ------------ | ----- |
| 10.11.x  | `net9.0`       | `net9.0`     | ✅    |
| 12.x     | `net10.0`      | `net9.0`     | ✅    |
| 12.x     | `net10.0`      | `net10.0`    | ✅    |
| 10.11.x  | `net9.0`       | `net10.0`    | ❌    |

The plugin is multi-targeted (`net9.0;net10.0`). A plugin assembly must never target a **newer**
runtime than the server it is loaded into, so the `net10.0` build only runs on Jellyfin 12.x.
The `net9.0` build is forward compatible and runs on both 10.11 and 12.x.

> `targetAbi` is a **minimum** server version. Keep it in sync with the ABI you compiled against.

## Build

```sh
dotnet build Jellyfin.Plugin.PlaybackReporting.sln -c Release
```

Requires the .NET 10 SDK (it can also build the `net9.0` target).

## Package

```sh
./build.sh net9.0        # ABI used by Jellyfin 10.11 and 12  (recommended)
./build.sh net10.0       # ABI used by Jellyfin 12 only
```

The script builds the requested target and writes `dist/playback_reporting_<version>-<tfm>.zip`
(the plugin assembly plus `SQLitePCL.pretty.dll`) and prints the manifest entry for it, including
the MD5 checksum Jellyfin expects.

## Install

### From a plugin repository (recommended)

This repository doubles as a Jellyfin plugin repository. In Jellyfin open
*Dashboard → Plugins → Repositories*, add

```
https://raw.githubusercontent.com/michalkulik/playback_reporting/develop/manifest.json
```

and then install **Playback Reporting** from *Dashboard → Plugins → Catalog*.

The URL must point at the **`manifest.json` file**, not at the repository page. The catalog only
shows the plugin once a release containing the zip exists, because `manifest.json` is populated by
the release workflow.

### Manually

```sh
mkdir -p <data-dir>/plugins/Playback Reporting
cp Jellyfin.Plugin.PlaybackReporting/bin/Release/net9.0/Jellyfin.Plugin.PlaybackReporting.dll \
   Jellyfin.Plugin.PlaybackReporting/bin/Release/net9.0/SQLitePCL.pretty.dll \
   <data-dir>/plugins/Playback Reporting/
```

Then restart Jellyfin.

## Publishing a new version

Publishing is automated once a tag is pushed:

```sh
# 1. bump <AssemblyVersion> in Directory.Build.props
# 2. commit it, then tag and push
git commit -am "Release 3.0.1.0"
git tag v3.0.1.0
git push origin develop --tags
```

The `Release Plugin` workflow then builds the `net9.0` and `net10.0` packages, attaches the zips to
a GitHub Release and writes the matching entries (with their MD5 checksums) into `manifest.json`.

## Notes on the port

See [`PORT_DO_JELLYFIN.md`](PORT_DO_JELLYFIN.md) for the full analysis of the Emby → Jellyfin
migration. The most important behavioural differences versus the Emby plugin:

- Emby's ServiceStack API was replaced with an ASP.NET Core controller on the same
  `user_usage_stats` routes, so the bundled pages are unchanged.
- `IServerEntryPoint` was replaced with a hosted service registered through
  `IPluginServiceRegistrator`.
- Jellyfin has no extensible notification types, so the "New Media" / "User Activity" notification
  tasks now write their reports to the **activity log** instead of sending notifications.

