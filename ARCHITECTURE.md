# GameVault architecture

GameVault has three first-class clients sharing one lossless Google Drive file:

| Client | Entry point | Local storage | Credential storage |
|---|---|---|---|
| Web/PWA | `index.html`, `app.js`, `core.js` | IndexedDB + local recovery state | Browser device storage; optional passphrase-encrypted trusted-device package |
| Windows | `windows-native/GameVault.Windows` | `%LOCALAPPDATA%\SinuGameVault` with atomic saves and recovery snapshots | Windows Credential Manager |
| Android TV | `android-tv-native` | App-private files with bounded recovery copies | Android Keystore |

`shared/game-vault.schema.json` and `shared/fixtures/vault-v14.json` define the
cross-client data contract. All clients preserve fields they do not own.

## Ownership boundaries

- User library state is authoritative in `game-vault-backup.json`.
- Catalogs, posters, plots, ratings, Plex pages, and availability responses are
  caches. A cache refresh must not advance the user-data revision on its own.
- Web owns health data and the browser catalog snapshot used by Android TV.
- Windows owns its local diagnostics and recovery index; these never sync.
- Android TV performs essential edits only and stores a conflict recovery copy
  before adopting a concurrently changed Drive vault.

## Sync invariants

1. Download and inspect the current Drive file before every upload.
2. Never replace a populated remote vault with an empty local vault.
3. Preserve unknown properties and deletion markers.
4. Debounce ordinary saves by 2.5 seconds, but serialize uploads.
5. Record the last remote revision actually observed, separately from the local
   file timestamp.
6. Keep a recovery copy before resolving an unreadable or concurrent state.

## Deployment

- GitHub Pages publishes the versioned web assets and service worker.
- Windows CI builds and smoke-tests the native application.
- Android CI builds the native Android TV APK from a clean checkout.
- BiglyBT Worker deployment is separate because it contains environment-specific
  upstream and authentication configuration.

The legacy `android-tv` WebView launcher remains only as a fallback. New TV
features belong in `android-tv-native`.
