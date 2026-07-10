# BiglyBT in GameVault — complete setup guide (from zero)

Goal: see your BiglyBT torrents **inside** GameVault as a live dashboard.

You will do three things, in order:

1. **Part A** – turn on BiglyBT's remote API (the "Vuze Web Remote" plugin).
2. **Part B** – create a free Cloudflare Worker (the secure bridge) — no coding.
3. **Part C** – connect GameVault to it.

Then **Part D** locks it down so strangers can't use it.

Nothing here costs money. Set aside ~30 minutes.

---

## Part A — Turn on BiglyBT's remote API

GameVault talks to BiglyBT through its **Transmission RPC**, provided by the
**Vuze Web Remote** plugin. Your current `http://…:8080` page is a *different*
plugin (the browsable HTML UI), so we set this one up separately.

### A1. Check if you already have it
In a browser on the same network as BiglyBT, visit:

```
http://<your-biglybt-ip>:8080/transmission/rpc
```

- If it **pops up a username/password box** (or shows text mentioning
  `409` / `session-id` / `transmission`): you already have the RPC on 8080.
  Write down **`8080`** as your RPC port and skip to **A4**.
- If it shows a **normal web page or "404 / not found"**: it's the HTML UI, not
  the RPC. Continue to **A2**.

### A2. Install the Vuze Web Remote plugin
1. Open BiglyBT on the computer where it runs.
2. Top menu: **Tools → Plugins → Installation Wizard**.
3. Choose **"By List"** (browse available plugins) and click Next.
4. In the list find **"Vuze Web Remote"** (it may be called *Web Remote* /
   *Transmission Web*), tick it, click **Next / Install**.
5. When it finishes, **restart BiglyBT** if it asks.

### A3. Configure it (port + password)
1. Menu: **Tools → Options** (on macOS: BiglyBT → Preferences).
2. Left tree: **Plugins → Vuze Web Remote** (or just "Web Remote").
3. Set these:
   - **Local port**: leave the default **`9091`** (that's the Transmission
     standard) unless it clashes with something — just remember whatever it is.
   - **Require a username and password**: ✅ tick it.
   - **Username**: pick one, e.g. `sinu`.
   - **Password**: pick a strong one. *Write both down* — you'll type them into
     GameVault later.
   - If there's an **"allow access from any IP" / "restrict IPs"** option, allow
     access (we'll protect it properly in Part D).
4. Click **OK / Save**. Restart BiglyBT if prompted.

### A4. Confirm the RPC works
Visit, replacing the port with yours:

```
http://<your-biglybt-ip>:9091/transmission/rpc
```

You should get a **login prompt** (enter the username/password from A3) and then
a short text/JSON response (often an error about a missing session id — that's
**normal and means it's working**).

### A5. Make it reachable from the internet
Cloudflare (Part B) runs in the cloud, so it must be able to reach your BiglyBT
RPC port from outside your home:

- On your router, **port-forward** the RPC port (e.g. `9091`) to the BiglyBT
  computer — the same way `8080` is already forwarded for your current UI.
- Note your **public address** (the `124.123.66.75` you use for `:8080`).

> Prefer not to open another port? See **Part D → Cloudflare Tunnel** for a way
> that opens **nothing** on your router. But for a first run, port-forwarding is
> simplest.

Your RPC base URL is now: `http://<your-public-ip>:9091`  (write it down).

---

## Part B — Create the Cloudflare Worker (the bridge)

This is a tiny always-on program on Cloudflare's free tier. It keeps your home
address and password out of the public GameVault website, and translates
GameVault's requests into BiglyBT's language.

### B1. Make a free Cloudflare account
1. Go to **https://dash.cloudflare.com/sign-up**.
2. Sign up with email + password, verify the email. (No credit card, no domain
   needed.)

### B2. Create the Worker
1. In the left sidebar click **Workers & Pages** (may be under "Compute").
2. Click **Create application → Create Worker**.
3. Name it **`gamevault-biglybt`** (this becomes part of its web address).
4. Click **Deploy** (it deploys a placeholder "Hello World" for now).
5. Click **Edit code** (or "Continue to project" → "Edit code").

### B3. Paste in the gateway code
1. Open the file **`biglybt-gateway/worker.js`** from your GameVault repo
   (on GitHub: `github.com/sinuksml/gamevault/blob/main/biglybt-gateway/worker.js`
   → click the "Copy raw file" icon).
2. In the Cloudflare code editor, **select all** the existing code and delete it.
3. **Paste** the `worker.js` contents.
4. Click **Deploy** (top-right).

### B4. Add your settings (secrets)
1. Leave the editor (breadcrumb → your Worker name) to reach the Worker's
   overview.
2. Go to **Settings → Variables and Secrets** (older UI: "Variables").
3. Add three variables (click **Add** for each, then **Deploy/Save**):

   | Name          | Type              | Value                                   |
   |---------------|-------------------|-----------------------------------------|
   | `BIGLY_URL`   | **Secret** (Encrypt) | `http://<your-public-ip>:9091`       |
   | `ALLOW_ORIGIN`| Text (plaintext)  | `https://sinuksml.github.io`            |
   | `RPC_PATH`    | Text (plaintext)  | `/transmission/rpc`                     |

   - Use **your** public IP and **your** RPC port in `BIGLY_URL`.
   - If A1 said your RPC is already on 8080, use `http://<ip>:8080` here.
4. Click **Save and deploy**.

### B5. Copy the Worker's web address
At the top of the Worker page you'll see its URL, like:

```
https://gamevault-biglybt.<your-name>.workers.dev
```

Copy it — that's what GameVault needs.

---

## Part C — Connect GameVault

1. Open GameVault → **⋯ menu → Settings**.
2. Find **"BiglyBT gateway"**.
3. **Paste the Worker URL** into the box.
4. **Mode**: choose **Native dashboard (Worker API)**.
5. Click **Save BiglyBT gateway**.
6. Open the **⬇ BiglyBT** tab. You'll see a **Sign in to BiglyBT** form.
7. Enter the **username/password from Part A3** and click **Login**.

Your torrents appear as cards with progress, speeds, seeds/peers, and
Start/Pause/Stop/Remove/Priority buttons. Tap **Refresh** to update.

> Your login is kept only for the current browser session and is sent only to
> your own Worker — never stored in the public site.

---

## Part D — Lock it down (do this once it works)

Right now the Worker (and your open port) can be reached by anyone who learns the
address. Two quick hardening steps:

### D1. Put the Worker behind Cloudflare Access (only you can use it)
1. Cloudflare dashboard → **Zero Trust** (may prompt a one-time free plan pick —
   choose the free tier, no card).
2. **Access → Applications → Add an application → Self-hosted**.
3. Application domain: your Worker's `*.workers.dev` hostname.
4. Add a **policy**: Action *Allow*, Include → *Emails* → **your email only**.
5. Save. Now the Worker requires you to log in with your email (one-time code)
   before it responds. GameVault will hand you through this on first use.

### D2. Stop exposing your home port (optional but best)
Instead of port-forwarding, use a **Cloudflare Tunnel** so nothing is open on
your router:

1. On the BiglyBT computer, install **cloudflared**
   (https://developers.cloudflare.com/cloudflare-tunnel/ → downloads).
2. `cloudflared tunnel login`, then create a tunnel and route a hostname (e.g.
   `biglybt.yourdomain`) to `http://localhost:9091`. (Needs a domain on
   Cloudflare; the free `trycloudflare` quick tunnel works for testing but the
   URL changes each run.)
3. Set the Worker's `BIGLY_URL` secret to that tunnel hostname instead of your
   public IP, and close the port on your router.

This also fixes the problem of your home IP changing over time.

---

## Troubleshooting

- **"BiglyBT rejected those credentials."** → wrong username/password from A3,
  or the plugin's password option isn't actually enabled.
- **"Can't reach BiglyBT (502/timeout)."** → the Worker can't reach `BIGLY_URL`.
  Check: right IP + RPC port, port-forwarded/open, BiglyBT running. Test the
  `…/transmission/rpc` URL from A4 from outside your home network (e.g. phone on
  mobile data).
- **"Session expired — log in again."** → just log in again on the tab.
- **The tab shows the old iframe / "HTTPS proxy required."** → Settings mode
  isn't set to **Native dashboard (Worker API)**, or the URL is still `http://`.
- **Torrents load but a field looks wrong (seeds/ETA/speed).** → send me one
  torrent's raw RPC response and I'll adjust the field mapping.
- **CORS error in the browser console.** → `ALLOW_ORIGIN` must be exactly
  `https://sinuksml.github.io` (no trailing slash).

---

### Alternative: deploy via command line (Wrangler)
Prefer the CLI? With Node.js installed, from the `biglybt-gateway/` folder:

```bash
npm i -g wrangler
wrangler login
wrangler secret put BIGLY_URL      # http://<ip>:9091
wrangler deploy
```

`ALLOW_ORIGIN` and `RPC_PATH` come from `wrangler.toml`; edit them there if
needed.
