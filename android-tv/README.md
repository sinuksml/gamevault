# GameVault Android TV Launcher

This is a tiny Android TV launcher app for NVIDIA Shield TV Pro.

It does not embed GameVault in a WebView, because Google Drive sign-in can fail inside embedded WebViews. Instead, the tile opens:

`https://sinuksml.github.io/gamevault/?tv=1`

in the default Android TV browser, such as TV Bro. The `?tv=1` flag enables the remote-friendly TV layout without changing the normal PC/mobile website. This keeps Google OAuth and Drive sync working through the browser.

## Build

1. Open this `android-tv` folder in Android Studio.
2. Let Android Studio install the Android SDK and Gradle plugin if prompted.
3. Build `app`.
4. Copy the generated APK to the Shield and sideload it.

The APK will appear as a Leanback launcher app tile named `GameVault`.
