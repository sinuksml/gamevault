const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
function unb64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
async function cookieKey(secret) {
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await cookieKey(secret);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(value));
  return b64(iv) + "." + b64(data);
}
async function open(value, secret) {
  try {
    const [iv, data] = value.split(".");
    const key = await cookieKey(secret);
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(data)));
  } catch (_) { return ""; }
}
function cookie(request, name) {
  const row = request.headers.get("Cookie") || "";
  const hit = row.split(/;\s*/).find(v => v.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
}
function loginPage(message = "") {
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#090d14;color:#eef4ff;font:16px system-ui;display:grid;place-items:center;min-height:100vh}.box{width:min(460px,88vw);padding:24px;border:1px solid #3488e8;border-radius:12px;background:#111925}input,button{box-sizing:border-box;width:100%;padding:13px;margin-top:12px;border-radius:8px;border:1px solid #345;background:#080d15;color:#fff}button{background:#1479e8;font-weight:700}.err{color:#ff8f8f}</style><form class="box" method="post" action="/__login"><h2>BiglyBT Login</h2><p>Saved securely on this device after the first successful login.</p>${message ? `<p class="err">${message}</p>` : ""}<input name="username" placeholder="Username" autocomplete="username" required><input name="password" type="password" placeholder="Password" autocomplete="current-password" required><button>Save and open BiglyBT</button></form>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
export default {
  async fetch(request, env) {
    if (!env.UPSTREAM_URL || !env.COOKIE_SECRET) return new Response("Gateway secrets are not configured.", { status: 503 });
    const incoming = new URL(request.url);
    if (incoming.pathname === "/__logout") return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": "gvbt=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=None; Partitioned" } });
    if (incoming.pathname === "/__login" && request.method === "POST") {
      const form = await request.formData();
      const username = String(form.get("username") || "");
      const password = String(form.get("password") || "");
      const test = await fetch(env.UPSTREAM_URL, { headers: { Authorization: "Basic " + btoa(username + ":" + password) }, redirect: "manual" });
      if (test.status === 401 || test.status === 403) return loginPage("Incorrect username or password.");
      const token = await seal(JSON.stringify({ username, password }), env.COOKIE_SECRET);
      return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": `gvbt=${encodeURIComponent(token)}; Max-Age=31536000; Path=/; Secure; HttpOnly; SameSite=None; Partitioned` } });
    }
    const saved = await open(cookie(request, "gvbt"), env.COOKIE_SECRET);
    if (!saved) return loginPage();
    const credentials = JSON.parse(saved);
    const upstreamBase = new URL(env.UPSTREAM_URL);
    const target = new URL(incoming.pathname + incoming.search, upstreamBase);
    const headers = new Headers(request.headers);
    headers.set("Authorization", "Basic " + btoa(credentials.username + ":" + credentials.password));
    headers.delete("Cookie");
    const response = await fetch(target, { method: request.method, headers, body: /^(GET|HEAD)$/i.test(request.method) ? undefined : request.body, redirect: "manual" });
    const out = new Headers(response.headers);
    out.delete("X-Frame-Options");
    out.delete("Content-Security-Policy");
    out.set("Content-Security-Policy", "frame-ancestors https://sinuksml.github.io");
    const location = out.get("Location");
    if (location) out.set("Location", location.replace(upstreamBase.origin, incoming.origin));
    return new Response(response.body, { status: response.status, headers: out });
  }
};
