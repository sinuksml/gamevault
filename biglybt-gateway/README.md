# GameVault ⇄ BiglyBT gateway (Cloudflare Worker)

This is the small HTTPS gateway that lets the **BiglyBT** tab in GameVault show
your torrents as a native dashboard. It runs on Cloudflare's free tier — no
server of your own to keep online — and keeps your BiglyBT address and login
out of the public GameVault site.

```
GameVault (HTTPS)  ──►  this Worker (HTTPS)  ──►  BiglyBT Web Remote (HTTP RPC)
```

## 1. Enable the Transmission RPC in BiglyBT (one time)
GameVault talks to BiglyBT through the **Vuze Web Remote** plugin (a
Transmission-compatible RPC) — *not* the browsable HTML WebUI on `:8080`.

1. In BiglyBT: **Tools → Plugins → Installation Wizard** (or Plugin Manager) →
   install **"Vuze Web Remote"** (a.k.a. Transmission Web / remote RPC).
2. Open its options and set a **username** and **password**.
3. Note the **port** it listens on (Transmission default is `9091`).
4. Test from the BiglyBT machine: `http://localhost:<port>/transmission/rpc`
   should prompt for those credentials.

> The `http://124.123.66.75:8080/` you had is the HTML WebUI — a different
> plugin. The gateway needs the Web Remote (RPC) port instead.

## 2. Deploy the Worker
Install Wrangler (needs Node): `npm i -g wrangler`, then from this folder:

```bash
wrangler login
# Your BiglyBT Web Remote base URL — kept secret, never committed:
wrangler secret put BIGLY_URL      # e.g. http://124.123.66.75:9091
wrangler deploy
```

Wrangler prints your Worker URL, e.g.
`https://gamevault-biglybt.<your-subdomain>.workers.dev`.

If your RPC path isn't the default, either edit `RPC_PATH` in `wrangler.toml`
or `wrangler secret put RPC_PATH`.

## 3. Point GameVault at it
GameVault → **⋯ menu → Settings → BiglyBT gateway**:
- Paste the Worker URL.
- Mode: **Native dashboard (Worker API)**.
- Save, open the **BiglyBT** tab, and log in with your Web Remote
  username/password. Credentials live only in this browser session; the Worker
  decodes them per-request and never stores them.

## 4. Lock it down (strongly recommended)
By itself the Worker is reachable by anyone who learns its URL (BiglyBT's own
login still guards it, but add a real gate):

- Cloudflare dashboard → **Zero Trust → Access → Applications** → add a
  self-hosted app for this Worker, policy = your email only. Now only you can
  reach the gateway. While you're at it, close the public `124.123.66.75`
  ports on your router and let the Worker reach BiglyBT through a **Cloudflare
  Tunnel** instead of an open port.

## Notes / limits
- A dynamic home IP will break `BIGLY_URL`; a Cloudflare Tunnel gives a stable
  hostname and avoids exposing ports.
- The Worker translates: start/resume→`torrent-start`, pause/stop→`torrent-stop`,
  remove→`torrent-remove` (keeps data), priority→`torrent-set bandwidthPriority`.
- If login fails with the credentials working elsewhere, confirm the plugin
  uses HTTP Basic auth and that `BIGLY_URL` points at the RPC port, not `:8080`.
