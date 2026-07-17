# Shield relay setup — make the BiglyBT tab work from anywhere

**The problem this solves:** BiglyBT on Android only allows remote control from
your own network ("Allow Remote Control on LAN"). Your Cloudflare Worker calls
from the internet, so BiglyBT answers **403 Forbidden**. There is no toggle to
change this in the Android app.

**The fix:** a tiny relay (**socat**, run inside the **Termux** terminal app)
on the Shield itself. The Worker's request arrives at the relay, and the relay
re-sends it to BiglyBT **from localhost** — which passes the LAN check.

```
GameVault ──► Cloudflare Worker ──► router :8080 ──► Shield :9095 (socat)
                                                        └──► 127.0.0.1:9093 BiglyBT ✅
```

One-time setup, ~20–30 minutes. Everything you already built (Worker, router
rule, BiglyBT password) stays as is — only the router rule's internal port
changes at the end.

**Your values used below:**
- Shield LAN IP: `192.168.0.100`  ·  BiglyBT remote port: `9093` (user `sinuksml`)
- Public IP: `124.123.66.75`  ·  Router external port: `8080`
- Relay port (new): `9095`
- Worker: `https://gamevault-biglybt.sinuksml.workers.dev`

---

## Part 1 — Install Termux on the Shield

Termux is a free, open-source Linux terminal for Android. It is **not on the
Play Store** (the Play Store build is abandoned) — you sideload the official
F-Droid build, the normal way Shield owners install apps.

### 1a. Allow sideloading
1. Shield: **Settings → Device Preferences → Security & Restrictions →
   Unknown sources** (wording varies) — you'll enable it for the installer app
   in a moment.

### 1b. Get the APK — pick ONE method

**Method A — Downloader app (all on the TV):**
1. Play Store on the Shield → install **"Downloader by AFTVnews"** (orange icon).
2. Open Downloader; when prompted, allow it to install unknown apps
   (Settings → Apps → Special app access → Install unknown apps → Downloader → Allow).
3. In Downloader's URL box enter: **`f-droid.org/packages/com.termux`**
4. On the page, download the latest **APK** (universal is fine) → **Install**.
5. Repeat with **`f-droid.org/packages/com.termux.boot`** → install
   **Termux:Boot** (this is what auto-starts the relay after a reboot).

**Method B — from your Windows PC with adb (better keyboard):**
1. On the PC, download **Platform Tools**:
   https://developer.android.com/tools/releases/platform-tools → unzip, open a
   terminal in that folder.
2. Shield: **Settings → Device Preferences → About → Build** — click it ~7
   times until "You are now a developer". Then **Developer options → Network
   debugging → ON** (note the IP:port it shows, usually `192.168.0.100:5555`).
3. On the PC download the two APKs from f-droid.org (`com.termux` and
   `com.termux.boot`), then:
   ```
   adb connect 192.168.0.100:5555      (accept the prompt on the TV)
   adb install termux_*.apk
   adb install termux.boot_*.apk
   ```

### 1c. First launch
Open **Termux** once from the Shield's app list (it may sit under
"See all apps"). You get a black terminal with a `$` prompt. Open
**Termux:Boot** once too (it just needs one launch to register itself).

---

## Part 2 — Type the setup commands

You need a way to type into Termux on a TV. Best options, in order:

- **USB or Bluetooth keyboard** plugged into the Shield — easiest by far.
- **adb from the PC** (Method B above): you can send keystrokes with
  `adb shell input text '...'` — note that **spaces must be written as `%s`**,
  and press Enter with `adb shell input keyevent 66`. Example:
  ```
  adb shell input text 'pkg%supdate%s-y'
  adb shell input keyevent 66
  ```
- The on-screen keyboard with the remote (painful but workable — it's only a
  few commands).

Now, in Termux, run these one at a time (each ends with Enter):

```bash
pkg update -y
pkg install -y socat termux-api
termux-wake-lock
mkdir -p ~/.termux/boot
```

Create the auto-start script (this writes the file in one go — safe to paste
as a single line):

```bash
printf '#!/data/data/com.termux/files/usr/bin/sh\ntermux-wake-lock\nwhile true; do socat TCP-LISTEN:9095,fork,reuseaddr TCP:127.0.0.1:9093; sleep 5; done\n' > ~/.termux/boot/start-relay.sh && chmod +x ~/.termux/boot/start-relay.sh
```

Start it right now (no reboot needed the first time):

```bash
sh ~/.termux/boot/start-relay.sh &
```

You should see no error — the relay is now listening on port **9095**.
(The `while true` loop restarts socat if it ever dies; `termux-wake-lock`
stops Android from putting Termux to sleep.)

**Quick local test** — from any phone/PC on your WiFi, open:
`http://192.168.0.100:9095/transmission/rpc`
You should get the same **409 / session-id** response as the direct 9093 test.
If yes, the relay works.

---

## Part 3 — Point the router at the relay

Router → **Port Forwarding** → edit the **"BiglyBT Cloudflare"** rule:

- External port: **8080** (unchanged)
- Internal IP: **192.168.0.100** (unchanged)
- Internal port: **9093 → change to 9095**
- Save.

(While you're there: the disabled `biglyBT 9093→9093` rule can be deleted, and
strongly consider deleting the **445 SMB** and **3389 RDP** rules — both are
serious attack targets. Map your Shield drives over the LAN instead:
`\\192.168.0.100\Elements`.)

---

## Part 4 — Test end to end

1. Browser (any network): `http://124.123.66.75:8080/transmission/rpc`
   → expect the **409** response again (now travelling via the relay).
2. GameVault → **⬇ BiglyBT** tab → Sign in: username **`sinuksml`** + your
   BiglyBT password → your torrents appear as live cards.

---

## Part 5 — Reboot survival check (do once)

Restart the Shield (Settings → Device Preferences → Restart). After it boots:
- BiglyBT auto-starts (you already have **Auto-start on Boot: ON**).
- Termux:Boot runs `start-relay.sh` automatically (~15–30 s after boot).
- Re-run the Part 4 test. If it works after a reboot, you're done forever.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pkg update` fails / repo errors | Termux mirrors change; run `termux-change-repo`, pick a different mirror, retry. |
| Relay works, dies after hours | Android killed Termux. Make sure you ran the boot script version (it has `termux-wake-lock` + auto-restart loop). On newer Android also run from the PC: `adb shell settings put global settings_enabled_monitor_phantom_procs false` |
| `403` again in GameVault | The relay isn't in the path — recheck the router rule points at **9095**, and that socat is running (`pgrep socat` in Termux). |
| `409` locally on 9095 but public 8080 test fails | Router rule wrong or ISP blocks the port — re-save the rule; try from mobile data. |
| BiglyBT app updated and remote stopped | Reopen its Remote Access screen — port/password sometimes reset after major updates. |
| Want to stop everything | In Termux: `pkill socat`, delete `~/.termux/boot/start-relay.sh`, revert the router rule to 9093. |

## Security notes
- BiglyBT's password (`sinuksml` + your password) still protects every request;
  the relay adds no new unauthenticated surface beyond what 8080 already exposed.
- For a real lock, add **Cloudflare Access** in front of the Worker
  (Zero Trust → Access → Applications → your `workers.dev` host → Allow only
  your email), and keep the 445/3389 forwards deleted.
