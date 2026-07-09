# GameVault Android TV Launcher

This is a tiny Android TV WebView app for NVIDIA Shield TV Pro.

The tile opens GameVault directly inside the APK:

`https://sinuksml.github.io/gamevault/?tv=1`

The `?tv=1` flag enables the remote-friendly TV layout without changing the normal PC/mobile website. The APK intercepts YouTube links and opens them in the YouTube app. For Google Drive on TV, use the QR login flow in Settings instead of the normal browser popup login.

## Build

1. Open this `android-tv` folder in Android Studio.
2. Let Android Studio install the Android SDK and Gradle plugin if prompted.
3. Build `app`.
4. Copy the generated APK to the Shield and sideload it.

The APK will appear as a Leanback launcher app tile named `GameVault`.
