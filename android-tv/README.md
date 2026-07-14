# GameVault Android TV Launcher 1.6.0

This is a tiny Android TV WebView app for NVIDIA Shield TV Pro.

The tile opens GameVault directly inside the APK:

`https://sinuksml.github.io/gamevault/?tv=1&appv=1.6.0`

The `?tv=1` flag enables a dedicated view-only TV application without changing the normal PC/mobile website. Version 1.6.0 adds a YouTube-style navigation rail, horizontal content shelves, cinematic title details, deterministic row/card D-pad movement and a minimal TV System screen. YouTube links open in the Android TV YouTube app when it is installed.

For Google Drive on TV, use the QR login flow in Settings instead of the normal browser popup login. Search fields are intentionally skipped by D-pad navigation on TV; use PC or mobile when text search is needed.

## Build

1. Open this `android-tv` folder in Android Studio.
2. Let Android Studio install the Android SDK and Gradle plugin if prompted.
3. Choose **Build > Build App Bundle(s) or APK(s) > Build APK(s)**.
4. Copy `app/build/outputs/apk/debug/app-debug.apk` to the Shield and sideload it.

Installing a newer APK over the existing GameVault app preserves the app identity. Normal website updates load automatically from GitHub Pages; APK-specific launcher changes require installing the new APK.

The Shield normally exposes a 1080p logical Android TV canvas even when its HDMI output is 4K. GameVault therefore uses a ten-foot 1080p layout with high-resolution artwork, OLED-friendly dark surfaces, safe edge margins, and an adjustable TV display-size control.

The APK will appear as a Leanback launcher app tile named `GameVault`.
