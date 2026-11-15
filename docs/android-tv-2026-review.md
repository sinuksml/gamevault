# Android TV app: review and 2026 plan

Reviewed 15 November 2026. Covers `android-tv-native` (the app in use) and `android-tv` (the WebView launcher). There is no Android phone app in this repository.

## What exists

| | `android-tv-native` | `android-tv` |
|---|---|---|
| What it is | Native Android TV app for the Shield. About 2,900 lines of Java. | A WebView that loads the classic website with `?tv=1`. About 400 lines. |
| UI | One hand-drawn `View` of 1,326 lines (`VaultTvView`) with every shelf, card, detail page and dialog drawn on a `Canvas` with `Paint`. | The website. |
| Data | The vault is held as a raw `JSONObject` tree. Reads and writes go through `VaultData`. | The website's own storage. |
| Sync | `DriveRepository`: device-code sign-in, download, newest-wins with a recovery copy on conflict. | The website's sync. |
| Build | Gradle 9.3.0, AGP 8.5.2, `compileSdk`/`targetSdk` 35, `minSdk` 23. CI runs `assembleDebug` only. | Same toolchain. |
| Tests | None. | None. |

## Findings

### 1. TV edits were resurrected by the next device that synced (fixed in this change)

The website, the Windows app and the TV merge one Drive file record by record. A merge can only tell "this device deleted the title" from "this device never had it" if the deleting device leaves a tombstone. The TV removed records with no tombstone and no per-record timestamp.

Reproduced end to end: a game moved from Rental queue to Now Playing on the TV, then merged by the website's `core.js`, ended up in **both** lists. After the fix the same test leaves it only in Now Playing, and the finance block survives.

The fix is `SyncTracker.java`, a port of `trackChanges()` and `recordKey()` from `core.js`. Every TV edit now writes a timestamp for each changed record, a tombstone for each removed one, and the `deletions` marker the Windows app reads. Six JVM tests pin it, including the exact keys `core.js` produces.

### 2. Cached plots counted as edits (fixed)

Saving a Wikipedia plot went through the normal edit path, which advanced `updatedAt` and `revision` and scheduled an upload. An idle TV filling in plots could therefore out-timestamp a real edit made elsewhere. `ARCHITECTURE.md` says cache refreshes must not advance the revision. Plots now use `updateCache`, which saves locally and changes neither.

### 3. Unsynced TV edits could be discarded silently (fixed)

`sync()` kept a recovery copy only when the TV copy was the newer one. When Drive was newer and the TV also held edits Drive had never seen, the cache was overwritten with no recovery copy. It now keeps one and says so.

### 4. The offline copy was written in place (fixed)

`cache()` wrote the vault straight over the existing file, and an unreadable file read back as an empty library. This is the failure class behind the Windows 2.6.1 data loss. The text is now proven to parse, written to a temporary file, synced to disk and renamed into place. An unreadable file is kept under `Recovery/unreadable-*.json`.

### 5. Not changed, but worth knowing

- **The TV has no way to open Recovery.** Status messages say a copy was kept in Recovery, but nothing in the UI lists or restores one.
- **`usesCleartextTraffic="true"`** is set. The code contains no `http://` URL, but the Plex server address is typed by the user and could be an `http://` LAN address. Removing the flag could break Plex, so this needs a decision, not a blind change.
- **No tests, and CI only builds.** Now there are six JVM tests; CI is updated to run them.
- **Gradle and the Android Gradle Plugin are stale.** Dependabot's AGP 9.4 and 9.5 updates fail because they need Gradle 9.6 or newer and the wrapper is 9.3.0. Dependabot has a separate passing pull request for the wrapper (9.8.2). Merge that first, then the plugin update.
- **Sync is still newest-wins plus a recovery copy**, not a real merge. With tombstones in place the other clients merge TV edits correctly, but two devices editing the same title between syncs still produces a recovery copy instead of a merge.
- **The discovery shelves depend on the classic site.** The TV reads `nativeTvCatalog` from the Drive file, and only the classic site generates it. The new site at `/next/` passes it through but does not create it. Retiring the classic site would empty those shelves unless something else writes them.
- **The WebView launcher depends on the classic site too** (`?tv=1`). It cannot move to the new site without a TV mode there.

## Recommended plan

Decided with you: TV app only, rebuilt with Compose for TV, and the WebView launcher retired once the native app is solid.

1. **Sync foundation (done here).** Items 1 to 4 above, with tests and a cross-client check.
2. **Port the merge to Java.** Replace newest-wins with the same record-level merge as `core.js`, pinned by tests that run both over the same inputs, as the new website does. This removes the remaining conflict-copy case.
3. **Toolchain.** Merge Dependabot's wrapper update, then the plugin update. Move to Kotlin.
4. **Compose for TV.** Rebuild the screens one at a time on `androidx.tv:tv-material`, keeping the vault as a raw JSON tree. Typed models would silently drop fields the app does not know, which would erase finance, health and `_sync` on upload.
5. **Recovery and diagnostics screen** on the TV.
6. **Retire `android-tv`** once the native app has run on the Shield for a while.

## Rules for any rewrite

- **Keep the install identity:** `applicationId` `in.sinu.gamevault.nativetv`, the signing key, the preference file names (`native_tv`, `native_tv_secure`) and the Keystore alias `gamevault_native_tv`, with `versionCode` above 6. Otherwise Android installs a separate app and the Drive and Plex logins are lost.
- **Keep the vault untyped.** Read the fields the app shows; carry everything else through untouched.
- **Pin sync before UI.** Tests against `shared/fixtures/vault-v15.json` and `core.js` come before screens.
- **No on-device testing was possible here.** There is no Shield, emulator or attached device on this machine, and Gradle could not start locally. The Java was compiled and tested directly on the JVM; the APK was not rebuilt.
