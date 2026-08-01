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

- `MainWindow` owns navigation, view composition, filters, details, and user commands.
- `VaultRepository` owns schema-compatible data access, normalization, atomic persistence, and recovery.
- Service classes own cloud synchronization and external integrations.
- Focused editor and management windows own data-entry workflows.
- `GameVault.Windows.Smoke` verifies migration safety, duplicate prevention, editing, repeated rentals, state moves, recovery restoration, activity tracking, recent views, and unknown-field preservation.

## Distribution

The release is a self-contained, single-file `win-x64` application. Inno Setup installs it per machine and preserves the same application identity for future upgrades. The current package is version 2.0.3.
