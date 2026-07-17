# Sinu Game Vault Native TV

Current native release: **2.2.0**

The television client is optimized for a 4K Android TV controlled
with a D-pad remote. It uses a cinematic home screen, remembers focus separately
for every library, center-crops artwork, presents full-screen details, and enters
an OLED-safe ambient mode after inactivity. Essential status changes can be made
on TV and are safely synchronized through Google Drive.

Dedicated Android TV client for NVIDIA Shield TV Pro. This project is separate
from `android-tv`, which remains the working WebView fallback.

## Design

- Native Android Canvas UI with deterministic D-pad navigation.
- Read-only shelves for Games, Movies, TV Shows and Plex.
- Native BiglyBT list dashboard.
- Google Drive device-code login and local offline backup cache.
- Android Keystore encryption for refresh tokens and service credentials.
- Native YouTube intents for trailers and reviews.

## Build

Open `android-tv-native` in Android Studio or run:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleDebug
```

The APK is generated at `app/build/outputs/apk/debug/app-debug.apk`.

The native app installs alongside the existing GameVault TV launcher while it
is being verified.

## First run on Shield

1. Install `GameVault-Native-TV-v2.0.0-preview.apk`.
2. Open **Sinu Game Vault Native** and select **Settings** in the left rail.
3. Select **Connect Google Drive**. Scan the QR code with the phone that uses
   the same Google account as GameVault.
4. If Google rejects the default client, open **Google OAuth setup** and enter
   the TV OAuth Client ID and optional client secret used by the existing TV
   launcher. Select Save and scan the new QR.
5. After approval, the app downloads `game-vault-backup.json` and keeps a local
   offline copy. Use **Sync Google Drive** whenever an immediate refresh is
   needed.

The phone/PC website adds a read-only `nativeTvCatalog` snapshot to its next
normal Drive sync. This supplies the native Coming Soon, Blu-ray, Malayalam
OTT, English, Malayalam, Tamil and Hindi shelves without exposing API keys.

## Optional services

- **Plex Library:** enter the secure Plex server URL and owner token in native
  Settings. The token is encrypted with Android Keystore.
- **BiglyBT:** enter the HTTPS Cloudflare Worker gateway plus the normal
  BiglyBT username and password. Only the encrypted Worker session token is
  retained after login.

## Remote behavior

- Up/Down on the left rail changes sections.
- Right or OK enters the current section.
- D-pad movement remains within the nearest shelf or settings grid.
- OK opens a full-screen title page.
- Back closes QR/details first, then returns focus to the rail.
- Back must be pressed twice from the rail to exit the app.
