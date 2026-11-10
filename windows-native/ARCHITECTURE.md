# Native Windows architecture

## Principles

1. The Windows application is independent from the browser application.
2. `game-vault-backup.json` remains the shared synchronization and interchange contract.
3. Unknown JSON fields are preserved so native import/export and Drive synchronization do not erase web-only data.
4. Destructive operations require confirmation and local writes create recovery points.
5. OAuth credentials and refresh tokens use Windows Credential Manager rather than the vault file.
6. RAWG, TMDB, Wikipedia, Plex, BiglyBT, vendor availability, and Google Drive are isolated behind service classes and execute asynchronously.
7. Local saves use atomic replacement, duplicate normalization, and recoverable snapshots.

## Application layers

- `GameVault.Core` holds everything that is not interface. It has no UI dependency, so it can be tested without a window.
  - `LibraryReader` turns stored records into rows and owns sorting, grouping and filtering rules.
  - `LibraryActions` owns every change to a title: moving, renting, returning, hiding, rating, enrichment. It never asks a question or shows a message.
  - `DashboardData` computes due dates, spending and petrol figures.
- `GameVault.WinUI` is the interface.
  - `MainWindow` is the shell only: title bar, navigation pane, frame, status messages, window placement.
  - `AppState` is the one place pages reach for data. Pages never call each other: a page changes the vault, the vault raises Saved, and each visible page redraws on `LibraryChanged`.
  - `LibraryCommands` is the user-facing side of an action: confirm if destructive, call `LibraryActions`, report the result and offer Undo.
  - One page per section (`HomePage`, `LibraryPage` for Games, Movies and TV, `DetailPage`, `PlexPage`, `DownloadsPage`, `PetrolPage`, `SettingsPage`); dialogs are `ContentDialog`s.
- `VaultRepository` owns schema-compatible data access, normalization, atomic persistence, and recovery.
- Service classes own cloud synchronization and external integrations.
- `GameVault.Windows.Smoke` verifies migration safety, duplicate prevention, editing, repeated rentals, state moves, recovery restoration, activity tracking, recent views, and unknown-field preservation.

## Identity and synchronization

`VaultIdentity` is the only place that decides whether two records are the same title. Local duplicate detection, deletion markers and Drive merges all use it, and matching compares every identifier a record carries rather than a single primary key, because two devices can legitimately key the same title differently. Drive merges union by identity, carry across fields that exist on only one side, and refuse to upload when the remote file changed while the merge was being prepared.

## External services

Plex requests are serialized with a minimum gap and paged, library results are cached, and artwork is fetched on demand rather than mirrored to disk. Catalog responses are cached on disk with a per-endpoint lifetime, honour `Retry-After`, and the cache is trimmed. Artwork is downloaded once to a disk cache (`ArtworkCache`) and decoded from that file at display size.

## Distribution

The release is a self-contained, unpackaged `win-x64` WinUI 3 application: a folder containing the application, .NET and the Windows App SDK, so nothing needs installing first. Inno Setup preserves the existing machine-wide application identity for reliable upgrades.

The version is defined once in `Directory.Build.props`. `build-release.ps1` reads it for the archive name and passes it to Inno Setup, the project inherits it, and the About page reads it from the assembly — so a release cannot ship with mismatched numbers.
