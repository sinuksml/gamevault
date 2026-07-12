/*
 * GameVault ⇄ BiglyBT gateway — Cloudflare Worker
 * -------------------------------------------------
 * Bridges the HTTPS GameVault frontend to your (HTTP) BiglyBT server so the
 * browser's mixed-content block is avoided, and translates a tiny REST API
 * into BiglyBT's Transmission-compatible RPC.
 *
 * The app calls (all CORS-enabled):
 *   POST /login                 {username,password}      -> {token}
 *   GET  /torrents              (Authorization: Bearer)  -> [ {id,name,progress,status,downloadSpeed,uploadSpeed,eta,seeds,peers} ]
 *   POST /torrents/:id/action   {action,priority?}       -> {ok:true}
 *     action ∈ start | resume | pause | stop | remove | priority
 *
 * BiglyBT side: enable the "Vuze Web Remote" plugin (a Transmission RPC
 * endpoint) with a username + password, and note its port. That is the URL +
 * credentials this gateway uses — NOT the browsable HTML WebUI on :8080.
 *
 * Secrets / vars (see wrangler.toml + README):
 *   BIGLY_URL   e.g. http://124.123.66.75:9091   (the Vuze Web Remote base)
 *   RPC_PATH    optional, default /transmission/rpc
 *   ALLOW_ORIGIN optional, default https://sinuksml.github.io
 */

function allowOrigin(env){ return env.ALLOW_ORIGIN || "https://sinuksml.github.io"; }
function cors(env, extra){
  return Object.assign({
    "Access-Control-Allow-Origin": allowOrigin(env),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  }, extra || {});
}
function json(env, obj, status){
  return new Response(JSON.stringify(obj), { status: status || 200, headers: cors(env, { "Content-Type": "application/json" }) });
}

/* One Transmission RPC call, handling the 409 session-id handshake. */
async function rpc(env, basic, method, args){
  const base = (env.BIGLY_URL || "").replace(/\/+$/, "");
  const path = env.RPC_PATH || "/transmission/rpc";
  const url = base + path;
  const body = JSON.stringify({ method: method, arguments: args || {} });
  const headers = { "Content-Type": "application/json", "Authorization": "Basic " + basic };
  let res = await fetch(url, { method: "POST", headers: headers, body: body });
  if(res.status === 409){
    headers["X-Transmission-Session-Id"] = res.headers.get("X-Transmission-Session-Id") || "";
    res = await fetch(url, { method: "POST", headers: headers, body: body });
  }
  return res;
}

const STATUS = { 0:"Stopped", 1:"Queued (check)", 2:"Checking", 3:"Queued", 4:"Downloading", 5:"Queued (seed)", 6:"Seeding" };
function etaText(s){
  if(s == null || s < 0) return "—";
  if(s === 0) return "Done";
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return h ? (h+"h "+m+"m") : (m ? (m+"m") : (Math.floor(s)+"s"));
}

export default {
  async fetch(request, env){
    if(request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const authHeader = request.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    try{
      // --- login: validate the BiglyBT credentials, hand back an opaque token ---
      if(path === "/login" && request.method === "POST"){
        const b = await request.json().catch(function(){ return {}; });
        const basic = btoa((b.username || "") + ":" + (b.password || ""));
        const res = await rpc(env, basic, "session-get", {});
        if(res.status === 401) return json(env, { message: "BiglyBT rejected those credentials." }, 401);
        if(!res.ok) return json(env, { message: "Can't reach BiglyBT ("+res.status+"). Check BIGLY_URL and that the Web Remote plugin is running." }, 502);
        return json(env, { token: basic }); // token == basic creds; decoded per-request, never stored
      }

      if(!bearer) return json(env, { message: "Not logged in." }, 401);
      const basic = bearer;

      // --- list torrents ---
      if(path === "/torrents" && request.method === "GET"){
        const res = await rpc(env, basic, "torrent-get", {
          fields: ["id","hashString","name","percentDone","status","rateDownload","rateUpload","eta","peersSendingToUs","peersConnected","totalSize","sizeWhenDone","leftUntilDone","downloadedEver"]
        });
        if(res.status === 401) return json(env, { message: "Session expired — log in again." }, 401);
        if(!res.ok) return json(env, { message: "BiglyBT error ("+res.status+")." }, 502);
        const data = await res.json();
        const list = (((data.arguments && data.arguments.torrents) || [])).map(function(t){
          return {
            id: t.hashString, name: t.name,
            progress: t.percentDone, status: STATUS[t.status] || "Unknown",
            downloadSpeed: t.rateDownload, uploadSpeed: t.rateUpload,
            eta: etaText(t.eta), seeds: t.peersSendingToUs, peers: t.peersConnected,
            totalSize: t.sizeWhenDone || t.totalSize || 0,
            downloaded: t.downloadedEver || Math.max(0,(t.sizeWhenDone||t.totalSize||0)-(t.leftUntilDone||0))
          };
        });
        return json(env, list);
      }

      // --- per-torrent action ---
      const m = path.match(/^\/torrents\/([^/]+)\/action$/);
      if(m && request.method === "POST"){
        const id = decodeURIComponent(m[1]);
        const b = await request.json().catch(function(){ return {}; });
        const action = b.action;
        let method = "", args = { ids: [id] };
        if(action === "start" || action === "resume") method = "torrent-start";
        else if(action === "pause" || action === "stop") method = "torrent-stop";
        else if(action === "remove" || action === "remove-data"){
          method = "torrent-remove"; args["delete-local-data"] = action === "remove-data";
        }
        else if(action === "priority"){ method = "torrent-set"; args.bandwidthPriority = b.priority === "high" ? 1 : (b.priority === "low" ? -1 : 0); }
        else return json(env, { message: "Unknown action." }, 400);
        const res = await rpc(env, basic, method, args);
        if(res.status === 401) return json(env, { message: "Session expired — log in again." }, 401);
        if(!res.ok) return json(env, { message: "Action failed ("+res.status+")." }, 502);
        return json(env, { ok: true });
      }

      return json(env, { message: "Not found." }, 404);
    }catch(e){
      return json(env, { message: "Gateway error: " + (e && e.message || e) }, 500);
    }
  }
};
