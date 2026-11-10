# Sinu Game Vault for Windows

Sinu Game Vault for Windows is a native WinUI 3 application in the Windows 11 Fluent style. It does not embed the website and does not require a browser or a separate .NET installation after publishing.

## Version 3.0.0

The interface lives in `GameVault.WinUI`; storage, sync and services live in `GameVault.Core`. `GameVault.Windows` is the previous WPF edition, kept buildable as a fallback. See `RELEASE_NOTES.md` for what changed.

- Native Home, Games, Movies, TV Shows, Plex, BiglyBT, and Settings areas.
- Complete game workflows for rentals, subscriptions, playing, queue, upcoming, discovery, and completed games.
- Movie and TV watchlists, watching/watched states, discovery, regional catalogs, release dates, ratings, plots, providers, seasons, and episodes.
- Poster and cover grids plus list views, search, year/genre filters, full detail pages, personal ratings, trailers, reviews, and status actions.
- Rental history editing, vendor spending reports, subscription management, rental availability checks, and recommendation ranking.
- Native Plex library browsing and explicit media deletion controls.
- Native BiglyBT dashboard, history, torrent controls, magnet entry, background refresh, and optional auto-removal after completion.
- Google Drive OAuth and timestamp-based synchronization with the shared `game-vault-backup.json` file.
- Lossless import/export, atomic local saves, duplicate cleanup, and automatic recovery snapshots.
- Light, dark and follow-Windows themes, a Mica background, and layouts that adapt from laptops to desktop monitors.
- Keyboard shortcuts, right-click card actions, Undo after changes, and navigation that remembers the last section and list.
- Activity history, manual restore points, recovery browsing, stale catalog caching, and privacy-safe diagnostic exports.

## Build and test

From the `windows-native` directory:

```powershell
.\build-release.ps1
```

The script runs the vault and sync smoke tests, builds the application, publishes a self-contained folder (application, .NET and the Windows App SDK together), creates a portable ZIP, and creates an installer when Inno Setup is available. The first build downloads the Windows App SDK from nuget.org.

## Install

Run `installer-output\SinuGameVault-Setup-v3.0.0.exe`. The installer upgrades the existing installation under `C:\Program Files\Sinu Game Vault`, creates a Start Menu entry, optionally creates a desktop shortcut, and registers a normal Windows uninstaller.

The portable release is `SinuGameVault-Windows-v3.0.0.zip`. Extract the whole folder to a permanent directory and run `SinuGameVault.exe` from it.

Windows SmartScreen may display an unknown-publisher warning because this personal build is not code-signed.

## One-time Google Drive setup

The website's Web OAuth credential cannot receive a native Windows callback. Create one Desktop OAuth credential in the same Google Cloud project:

1. Open Google Cloud Console and select project `898110284062`.
2. Open **APIs & Services > Credentials**.
3. Choose **Create credentials > OAuth client ID**.
4. Select **Desktop app** and name it `Sinu Game Vault Windows`.
5. Copy the generated Client ID.
6. In the Windows app, open **Settings**, paste the Client ID, and choose **Sign in with Google**.

Tokens are stored in Windows Credential Manager. The app uses the same `game-vault-backup.json` Drive file as the web and TV versions.

## Local data

The native vault is stored at `%LOCALAPPDATA%\SinuGameVault\vault.json`. Recovery snapshots are stored in `%LOCALAPPDATA%\SinuGameVault\Recovery`.

Catalog responses are cached under `%LOCALAPPDATA%\SinuGameVault\CatalogCache`, and diagnostic logs are stored under `%LOCALAPPDATA%\SinuGameVault\Diagnostics`.
