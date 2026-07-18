import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_COOKIE = "gvbt_session";
const WORKER_VERSION = "github-v17";
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

function frameHeaders(extra) {
  return Object.assign({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "frame-ancestors https://sinuksml.github.io",
    "X-GameVault-Worker-Version": WORKER_VERSION
  }, extra || {});
}

function htmlPage(message, isError, returnTo) {
  const notice = message
    ? `<p class="notice ${isError ? "error" : ""}">${escapeHtml(message)}</p>`
    : "";
  const next = returnTo === "/__native" ? "/__native" : "/";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BiglyBT Login</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#090d14;color:#eef4ff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.box{width:min(460px,100%);padding:24px;border:1px solid #2b4770;border-radius:14px;background:#111927;box-shadow:0 18px 50px #0008}h1{margin:0 0 7px;font-size:25px}p{color:#9eabc0;line-height:1.5;margin:0 0 16px}.notice{padding:10px 12px;border:1px solid #315b8f;border-radius:9px;background:#132943;color:#dbeaff}.notice.error{border-color:#9c3e48;background:#35181d;color:#ffb9c0}label{display:block;margin:12px 0 5px;font-size:12px;font-weight:700;color:#bdc9dc}input{width:100%;padding:12px;border:1px solid #30425e;border-radius:9px;background:#080d15;color:#fff;font:inherit;outline:none}input:focus{border-color:#4b9cff;box-shadow:0 0 0 3px #2878d52b}button{width:100%;margin-top:16px;padding:12px;border:1px solid #4b9cff;border-radius:9px;background:#1674df;color:#fff;font:700 15px inherit;cursor:pointer}.small{font-size:11px;margin:13px 0 0;text-align:center;color:#738198}
</style></head><body><main class="box"><h1>Sign in to BiglyBT</h1><p>Enter the same username and password that work on your BiglyBT Web Remote.</p>${notice}<form method="post" action="/__login?next=${encodeURIComponent(next)}"><label for="user">Username</label><input id="user" name="username" autocomplete="username" required autofocus><label for="pass">Password</label><input id="pass" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form><p class="small">Credentials are encrypted in a secure, device-specific browser session and are never stored in GameVault or GitHub.</p></main></body></html>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sessionKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function sealSession(credentials, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sessionKey(secret);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(credentials)));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(data))}`;
}

async function openSession(value, secret) {
  try {
    const [ivPart, dataPart] = value.split(".");
    if (!ivPart || !dataPart) return null;
    const key = await sessionKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivPart) },
      key,
      base64UrlToBytes(dataPart)
    );
    const credentials = JSON.parse(decoder.decode(plain));
    return credentials.username && credentials.password ? credentials : null;
  } catch (_) {
    return null;
  }
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : "";
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`;
}

function basicAuth(username, password) {
  const bytes = encoder.encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function safeHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function requestBodyAllowed(method) {
  return !/^(GET|HEAD)$/i.test(method);
}

function forwardedRequestHeaders(request) {
  const names = [
    ["Accept", "accept"],
    ["Accept-Language", "accept-language"],
    ["Content-Type", "content-type"],
    ["If-Modified-Since", "if-modified-since"],
    ["If-None-Match", "if-none-match"],
    ["Range", "range"],
    ["User-Agent", "user-agent"],
    ["X-Requested-With", "x-requested-with"],
    ["X-Transmission-Session-Id", "x-transmission-session-id"]
  ];
  const result = [];
  for (const [outgoingName, incomingName] of names) {
    const value = request.headers.get(incomingName);
    if (value) result.push([outgoingName, safeHeaderValue(value)]);
  }

  const cookies = (request.headers.get("Cookie") || "")
    .split(/;\s*/)
    .filter((cookie) => cookie && !cookie.startsWith(`${SESSION_COOKIE}=`));
  if (cookies.length) result.push(["Cookie", safeHeaderValue(cookies.join("; "))]);
  return result;
}

function findSequence(bytes, sequence, start) {
  const from = start || 0;
  outer: for (let i = from; i <= bytes.length - sequence.length; i += 1) {
    for (let j = 0; j < sequence.length; j += 1) {
      if (bytes[i + j] !== sequence[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function joinBytes(chunks, total) {
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

async function readSocketBytes(readable) {
  const reader = readable.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || !value.byteLength) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new Error("BiglyBT response exceeded the 32 MB proxy limit.");
      }
      chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  return joinBytes(chunks, total);
}

function decodeChunkedBody(body) {
  const chunks = [];
  let total = 0;
  let position = 0;
  while (position < body.length) {
    const lineEnd = findSequence(body, [13, 10], position);
    if (lineEnd < 0) throw new Error("Invalid chunked response from BiglyBT.");
    const sizeText = decoder.decode(body.subarray(position, lineEnd)).split(";", 1)[0].trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size < 0) throw new Error("Invalid chunk size from BiglyBT.");
    position = lineEnd + 2;
    if (size === 0) return joinBytes(chunks, total);
    if (position + size + 2 > body.length) throw new Error("Incomplete chunked response from BiglyBT.");
    const chunk = body.slice(position, position + size);
    chunks.push(chunk);
    total += chunk.byteLength;
    position += size;
    if (body[position] !== 13 || body[position + 1] !== 10) {
      throw new Error("Invalid chunk boundary from BiglyBT.");
    }
    position += 2;
  }
  throw new Error("Incomplete chunked response from BiglyBT.");
}

function parseRawResponse(raw, requestMethod) {
  const headerEnd = findSequence(raw, [13, 10, 13, 10], 0);
  if (headerEnd < 0) throw new Error("BiglyBT returned an invalid HTTP response.");

  const headerText = decoder.decode(raw.subarray(0, headerEnd));
  const lines = headerText.split("\r\n");
  const statusMatch = lines.shift().match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+.*)?$/i);
  if (!statusMatch) throw new Error("BiglyBT returned an invalid HTTP status line.");
  const status = Number(statusMatch[1]);
  const headers = new Headers();
  let transferEncoding = "";
  let contentLength = null;

  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    const lower = name.toLowerCase();
    if (lower === "transfer-encoding") {
      transferEncoding = value.toLowerCase();
      continue;
    }
    if (lower === "content-length") {
      const parsed = Number.parseInt(value, 10);
      contentLength = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
      continue;
    }
    if (["connection", "keep-alive", "proxy-authenticate", "proxy-connection", "trailer", "upgrade"].includes(lower)) {
      continue;
    }
    try {
      headers.append(name, value);
    } catch (_) {
      // Ignore malformed upstream headers instead of breaking the dashboard.
    }
  }

  const hasNoResponseBody = /^HEAD$/i.test(requestMethod) || [204, 205, 304].includes(status);
  let body = raw.slice(headerEnd + 4);
  if (hasNoResponseBody) {
    headers.delete("Content-Length");
    return new Response(null, { status, headers });
  }
  if (transferEncoding.includes("chunked")) {
    body = decodeChunkedBody(body);
  } else if (contentLength != null) {
    if (body.byteLength < contentLength) throw new Error("BiglyBT closed an incomplete response.");
    body = body.slice(0, contentLength);
  }
  headers.set("Content-Length", String(body.byteLength));
  return new Response(body, { status, headers });
}

async function upstreamFetch(request, env, credentials, pathOverride) {
  const incoming = new URL(request.url);
  const upstreamBase = new URL(env.UPSTREAM_URL);
  const path = pathOverride == null ? incoming.pathname + incoming.search : pathOverride;
  const target = new URL(path, upstreamBase);
  if (!/^https?:$/.test(target.protocol)) throw new Error("UPSTREAM_URL must use HTTP or HTTPS.");

  const method = pathOverride == null ? request.method.toUpperCase() : "GET";
  const body = pathOverride == null && requestBodyAllowed(method)
    ? new Uint8Array(await request.arrayBuffer())
    : new Uint8Array();
  const defaultPort = target.protocol === "https:" ? 443 : 80;
  const port = target.port ? Number(target.port) : defaultPort;
  const requestPath = `${target.pathname || "/"}${target.search}`;
  const headerLines = [
    `${method} ${requestPath} HTTP/1.1`,
    `Host: ${safeHeaderValue(target.host)}`,
    `Authorization: ${basicAuth(credentials.username, credentials.password)}`,
    "Cache-Control: no-store",
    "Accept-Encoding: identity",
    "Connection: close"
  ];
  if (pathOverride == null) {
    for (const [name, value] of forwardedRequestHeaders(request)) {
      headerLines.push(`${name}: ${value}`);
    }
  } else {
    headerLines.push("Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  }
  if (requestBodyAllowed(method)) headerLines.push(`Content-Length: ${body.byteLength}`);
  const head = encoder.encode(`${headerLines.join("\r\n")}\r\n\r\n`);

  const socket = connect(
    { hostname: target.hostname, port },
    { secureTransport: target.protocol === "https:" ? "on" : "off", allowHalfOpen: false }
  );
  try {
    await socket.opened;
    const writer = socket.writable.getWriter();
    try {
      await writer.write(head);
      if (body.byteLength) await writer.write(body);
    } finally {
      writer.releaseLock();
    }
    const raw = await readSocketBytes(socket.readable);
    return parseRawResponse(raw, method);
  } finally {
    try {
      await socket.close();
    } catch (_) {
      // The peer normally closes first because requests use Connection: close.
    }
  }
}

function nativeDashboardPageLegacy() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BiglyBT Dashboard</title><style>
:root{color-scheme:dark;--bg:#090d14;--panel:#111927;--line:#2a3c58;--text:#eef4ff;--muted:#94a3ba;--blue:#2182ee;--danger:#e25261}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.shell{max-width:1500px;margin:auto;padding:18px}.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 -4px 14px;padding:8px 4px;background:#090d14ed;backdrop-filter:blur(14px)}.top h1{font-size:22px;margin:0 auto 0 0}.btn,input,select{border:1px solid var(--line);border-radius:8px;background:#0b121e;color:var(--text);font:inherit}.btn{padding:9px 12px;cursor:pointer;font-weight:700}.btn:hover{border-color:#5da8ff}.btn.blue{background:#176dce;border-color:#499fff}.btn.danger{color:#ffb5bc;border-color:#74343c}.btn:disabled{opacity:.45;cursor:not-allowed}.add{display:flex;gap:8px;margin-bottom:12px}.add input{flex:1;min-width:0;padding:10px 12px}.filters{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}.filters .on{background:#176dce;border-color:#499fff}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.stat,.card,.notice,.login{border:1px solid var(--line);border-radius:9px;background:var(--panel)}.stat{padding:10px}.stat b{display:block;font-size:17px}.stat span{font-size:11px;color:var(--muted)}.grid{display:flex;flex-direction:column;gap:8px}.card{padding:11px;display:grid;grid-template-columns:minmax(220px,1.5fr) minmax(210px,1fr) auto;gap:10px;align-items:center;border-left:3px solid #40536e;transition:border-color .2s,background .2s}.card[data-state="4"]{border-left-color:#35a7ff}.card[data-state="6"]{border-left-color:#45d38a}.card[data-state="0"]{border-left-color:#758198}.head{display:flex;gap:8px;align-items:flex-start}.name{font-weight:800;line-height:1.3;overflow-wrap:anywhere;flex:1}.status{font-size:10px;font-weight:800;padding:3px 7px;border:1px solid #3778bf;border-radius:999px;color:#bdddff;white-space:nowrap}.meter{height:8px;background:#080d15;border:1px solid #263951;border-radius:999px;overflow:hidden;margin-top:8px}.fill{height:100%;background:linear-gradient(90deg,#2182ee,#58d4ff)}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;color:var(--muted);font-size:11px}.meta b{color:var(--text)}.meta .wide{grid-column:1/-1}.actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.actions .btn,.actions select{font-size:11px;padding:7px 8px}.notice{padding:16px;text-align:center;color:var(--muted)}#message{position:fixed;z-index:50;top:14px;right:14px;width:min(420px,calc(100vw - 28px));box-shadow:0 12px 35px #0009;pointer-events:none}.error{border-color:#8a3942;color:#ffb5bc;background:#31171c}.login{width:min(460px,100%);margin:12vh auto;padding:22px}.login h2{margin:0 0 7px}.login p{color:var(--muted);line-height:1.45}.login label{display:block;font-size:12px;font-weight:700;margin:11px 0 5px}.login input{width:100%;padding:11px}.login .btn{width:100%;margin-top:14px}.hidden{display:none!important}@media(max-width:850px){.card{grid-template-columns:1fr}.actions{justify-content:flex-start}}@media(max-width:650px){.shell{padding:9px}.summary{grid-template-columns:repeat(2,1fr)}.add{flex-wrap:wrap}.add input{flex-basis:100%}.top h1{flex-basis:100%}.card{padding:10px}#message{top:8px;right:8px;width:calc(100vw - 16px)}}
</style></head><body><main class="shell"><section class="login hidden" id="login"><h2>Sign in to BiglyBT</h2><p>Sign in once on this device. Only an encrypted session token is saved; your password is never stored.</p><div id="loginError" class="notice error hidden"></div><form id="loginForm"><label>Username</label><input id="user" autocomplete="username" required><label>Password</label><input id="pass" type="password" autocomplete="current-password" required><button class="btn blue">Sign in and remember</button></form></section><section id="dashboard" class="hidden"><div class="top"><h1>Native BiglyBT Dashboard <small style="font-size:11px;color:var(--muted)">List view</small></h1><button class="btn blue" id="refresh">Refresh</button><button class="btn" id="historyView">History</button><button class="btn" id="auto">Auto: On</button><button class="btn" id="autoRemove">Remove completed: On</button><button class="btn" id="webUi">Open Web UI</button><button class="btn danger" id="forget">Forget saved login</button></div><div id="torrentView"><form class="add" id="addForm"><input id="magnet" placeholder="Paste a magnet link" autocomplete="off"><button class="btn blue">Add torrent</button></form><section class="summary" id="summary"></section><nav class="filters" id="filters"><button class="btn on" data-filter="active">Active</button><button class="btn" data-filter="queued">Queued</button><button class="btn" data-filter="completed">Completed</button><button class="btn" data-filter="seeding">Seeding</button><button class="btn" data-filter="all">All Torrents</button></nav><div id="message" class="notice">Loading torrents...</div><section class="grid" id="grid"></section></div><section id="historyPanel" class="hidden"><div class="notice">Completed and removed torrent activity is retained as a report. Downloaded files are only deleted when you explicitly choose Remove + files.</div><section class="grid" id="historyGrid"></section></section></section></main><script>
(function(){
document.body.style.background='rgba(9,13,20,.86)';
var TOKEN_KEY='gvbt_native_token',AUTO_KEY='gvbt_native_auto',AUTO_REMOVE_KEY='gvbt_native_remove_completed',HISTORY_KEY='gvbt_native_history',IDLE_MS=300000,token='',auto=true,autoRemove=true,busy=false,timer=null,idleTimer=null,idle=false,lastActivity=Date.now(),currentFilter='active',allItems=[],historyItems=[],historyMode=false,previousItems={},knownRemoved={},grid=document.getElementById('grid'),message=document.getElementById('message'),summary=document.getElementById('summary');try{token=localStorage.getItem(TOKEN_KEY)||'';auto=localStorage.getItem(AUTO_KEY)!=='0';autoRemove=localStorage.getItem(AUTO_REMOVE_KEY)!=='0';historyItems=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(!Array.isArray(historyItems))historyItems=[]}catch(e){historyItems=[]}function saveToken(value){token=value||'';try{if(token)localStorage.setItem(TOKEN_KEY,token);else localStorage.removeItem(TOKEN_KEY)}catch(e){}try{parent.postMessage({type:token?'gvbt-native-token-save':'gvbt-native-token-remove',token:token},'*')}catch(e){}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function bytes(n){n=Number(n)||0;var u=['B','KB','MB','GB','TB'],i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i?n.toFixed(n>=10?1:2):Math.round(n))+' '+u[i]}
function eta(n){n=Number(n);if(!isFinite(n)||n<0||n>31536000)return '--';if(n<60)return Math.round(n)+'s';if(n<3600)return Math.round(n/60)+'m';if(n<86400)return Math.floor(n/3600)+'h '+Math.round(n%3600/60)+'m';return Math.floor(n/86400)+'d '+Math.round(n%86400/3600)+'h'}
function statusName(s){return ({0:'Stopped',1:'Checking queued',2:'Checking',3:'Queued',4:'Downloading',5:'Seed queued',6:'Seeding'})[s]||'Unknown'}
function torrentKey(t){return String(t.hashString||t.id||t.name||'unknown')}
function torrentProgress(t){return Math.max(0,Math.min(100,(Number(t.percentDone)||0)*100))}
function historyEntry(t,outcome,filesDeleted){var total=Number(t.sizeWhenDone||t.totalSize)||0,left=Number(t.leftUntilDone),progress=torrentProgress(t),downloaded=Number.isFinite(left)&&total?Math.max(0,total-left):(Number(t.downloadedEver)||Math.round(total*progress/100));var hash=String(t.hashString||''),id=(hash||String(t.id||t.name))+':'+String(outcome).toLowerCase().replace(/[^a-z0-9]+/g,'-');return {id:id,at:Date.now(),name:t.name||'Untitled torrent',outcome:outcome,progress:progress,downloaded:downloaded,total:total,filesDeleted:!!filesDeleted,hash:hash}}
function saveHistory(){historyItems.sort(function(a,b){return (b.at||0)-(a.at||0)});historyItems=historyItems.slice(0,1000);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(historyItems))}catch(e){}}
function mergeHistory(items){var seen={};historyItems.concat(items||[]).forEach(function(x){if(x&&x.id&&!seen[x.id])seen[x.id]=x});historyItems=Object.keys(seen).map(function(k){return seen[k]});saveHistory();if(historyMode)renderHistory()}
function recordHistory(t,outcome,filesDeleted){var entry=historyEntry(t,outcome,filesDeleted);if(historyItems.some(function(x){return x.id===entry.id}))return;historyItems.unshift(entry);saveHistory();try{parent.postMessage({type:'gvbt-history-event',entry:entry},'*')}catch(e){}if(historyMode)renderHistory()}
function renderHistory(){var box=document.getElementById('historyGrid');if(!historyItems.length){box.innerHTML='<div class="notice">No torrent history has been recorded yet.</div>';return}box.innerHTML=historyItems.map(function(h){return '<article class="card"><div><div class="head"><div class="name">'+esc(h.name)+'</div><span class="status">'+esc(h.outcome)+'</span></div><div class="meta" style="margin-top:10px"><div>Progress <b>'+Number(h.progress||0).toFixed(1)+'%</b></div><div>Downloaded <b>'+bytes(h.downloaded)+' / '+bytes(h.total)+'</b></div><div class="wide">Date <b>'+new Date(h.at||Date.now()).toLocaleString()+'</b></div><div class="wide">Files <b>'+(h.filesDeleted?'Deleted with torrent':'Kept on storage')+'</b></div></div></div></article>'}).join('')}
function setHistoryMode(on){historyMode=!!on;document.getElementById('torrentView').classList.toggle('hidden',historyMode);document.getElementById('historyPanel').classList.toggle('hidden',!historyMode);document.getElementById('historyView').textContent=historyMode?'Back to Torrents':'History';if(historyMode)renderHistory()}
function authHeaders(){return {'Content-Type':'application/json','Authorization':'Bearer '+token}}
function showLogin(error){document.getElementById('dashboard').classList.add('hidden');document.getElementById('login').classList.remove('hidden');var box=document.getElementById('loginError');box.textContent=error||'';box.classList.toggle('hidden',!error)}
function updateAutoLabel(){document.getElementById('auto').textContent=!auto?'Auto: Off':idle?'Auto: Paused':'Auto: On'}
function updateAutoRemoveLabel(){document.getElementById('autoRemove').textContent='Remove completed: '+(autoRemove?'On':'Off')}
function showDashboard(){document.getElementById('login').classList.add('hidden');document.getElementById('dashboard').classList.remove('hidden');updateAutoLabel();updateAutoRemoveLabel()}
async function rpc(method,args){var r=await fetch('/__native/api',{method:'POST',headers:authHeaders(),body:JSON.stringify({method:method,arguments:args||{}})});var j=await r.json().catch(function(){return {}});if(r.status===401){saveToken('');showLogin('Your saved login expired. Please sign in again.');throw new Error('Sign in required')}if(!r.ok||j.result!=='success')throw new Error(j.message||j.result||('Request failed '+r.status));return j.arguments||{}}
function setMessage(text,error){message.textContent=text;message.className='notice'+(error?' error':'');message.classList.toggle('hidden',!text)}
function filteredItems(items){return items.filter(function(t){if(currentFilter==='all')return true;if(currentFilter==='active')return t.status===4||t.status===6;if(currentFilter==='queued')return t.status===1||t.status===3||t.status===5;if(currentFilter==='completed')return Number(t.percentDone)>=1;if(currentFilter==='seeding')return t.status===6;return true})}
function render(items){
  allItems=items||[];items=filteredItems(allItems);
  var active=items.filter(function(t){return t.status===4||t.status===6}).length;
  var down=items.reduce(function(n,t){return n+(Number(t.rateDownload)||0)},0);
  var up=items.reduce(function(n,t){return n+(Number(t.rateUpload)||0)},0);
  summary.innerHTML='<div class="stat"><b>'+items.length+'</b><span>Total torrents</span></div><div class="stat"><b>'+active+'</b><span>Active</span></div><div class="stat"><b>'+bytes(down)+'/s</b><span>Download speed</span></div><div class="stat"><b>'+bytes(up)+'/s</b><span>Upload speed</span></div>';
  if(!items.length){grid.innerHTML='';setMessage('No torrents found.',false);return}
  setMessage('',false);
  grid.innerHTML=items.map(function(t){
    var p=Math.max(0,Math.min(100,(Number(t.percentDone)||0)*100));
    var total=Number(t.sizeWhenDone||t.totalSize)||0;
    var left=Number(t.leftUntilDone), downloaded=Number.isFinite(left)&&total?Math.max(0,total-left):(Number(t.downloadedEver)||Math.round(total*p/100));
    return '<article class="card" data-state="'+esc(t.status)+'"><div><div class="head"><div class="name">'+esc(t.name||'Untitled torrent')+'</div><span class="status">'+esc(statusName(t.status))+'</span></div><div class="meter"><div class="fill" style="width:'+p.toFixed(1)+'%"></div></div></div><div class="meta"><div class="wide">Downloaded <b>'+bytes(downloaded)+' / '+bytes(total)+'</b></div><div>Progress <b>'+p.toFixed(1)+'%</b></div><div>ETA <b>'+eta(t.eta)+'</b></div><div>Down <b>'+bytes(t.rateDownload)+'/s</b></div><div>Up <b>'+bytes(t.rateUpload)+'/s</b></div><div>Seeds <b>'+esc(t.peersGettingFromUs||0)+'</b></div><div>Peers <b>'+esc(t.peersConnected||0)+'</b></div><div>Ratio <b>'+Number(t.uploadRatio||0).toFixed(2)+'</b></div></div><div class="actions"><button class="btn" data-method="torrent-start" data-id="'+esc(t.id)+'">Start</button><button class="btn" data-method="torrent-stop" data-id="'+esc(t.id)+'">Pause</button><select data-priority="'+esc(t.id)+'"><option value="">Priority</option><option value="1">High</option><option value="0">Normal</option><option value="-1">Low</option></select><button class="btn danger" data-method="torrent-remove" data-id="'+esc(t.id)+'" data-delete="0">Remove</button><button class="btn danger" data-method="torrent-remove" data-id="'+esc(t.id)+'" data-delete="1">Remove + files</button></div></article>';
  }).join('');
}
})();
</script></body></html>`;
}

function nativeDashboardPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>BiglyBT Dashboard</title><style>
:root{color-scheme:dark;--bg:#090d14;--panel:#111927;--panel2:#0d1521;--line:#2a3c58;--line2:#1e2c40;--text:#eef4ff;--muted:#9eacc1;--blue:#2182ee;--blue2:#65d6ff;--green:#42cf8b;--amber:#f2b84b;--red:#f06a76;--shadow:0 14px 36px rgba(0,0,0,.28)}*{box-sizing:border-box}html{scrollbar-gutter:stable}body{margin:0;background:rgba(9,13,20,.88);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px}.shell{max-width:1540px;margin:auto;padding:14px 18px 36px;font-variant-numeric:tabular-nums}.hidden{display:none!important}.btn,input,select{min-height:40px;border:1px solid var(--line);border-radius:8px;background:#0b121e;color:var(--text);font:inherit}.btn{padding:8px 12px;cursor:pointer;font-weight:750}.btn:hover{border-color:#5da8ff;background:#111d2e}.btn:focus-visible,input:focus-visible,select:focus-visible,.torrent-main:focus-visible{outline:2px solid var(--blue2);outline-offset:2px}.btn.blue{background:#176dce;border-color:#499fff}.btn.danger{color:#ffc2c7;border-color:#74343c}.btn:disabled{opacity:.48;cursor:not-allowed}.workspace{position:sticky;top:0;z-index:30;margin:0 -6px 12px;padding:10px 6px 11px;background:rgba(9,13,20,.94);backdrop-filter:blur(16px);border-bottom:1px solid var(--line2)}.workspace-main,.workspace-actions,.controlbar,.history-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.workspace-main h1{font-size:22px;line-height:1.1;margin:0 auto 0 0}.connection{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:700}.connection i{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 0 3px rgba(242,184,75,.14)}.connection.online i{background:var(--green);box-shadow:0 0 0 3px rgba(66,207,139,.14)}.connection.offline i{background:var(--red)}.workspace-sub{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:8px;color:var(--muted);font-size:12px}.workspace-sub b{color:var(--text)}.segmented{display:inline-flex;padding:3px;border:1px solid var(--line);border-radius:9px;background:#080e17}.segmented .btn{min-height:32px;padding:5px 10px;border:0;background:transparent}.segmented .btn.on{background:#176dce}.commandbar{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:10px;margin-bottom:12px}.add{display:flex;gap:8px}.add input{flex:1;min-width:0;padding:8px 12px}.summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:12px}.stat,.torrent,.notice,.login,.history-card{border:1px solid var(--line);border-radius:9px;background:var(--panel)}.stat{padding:10px 12px;min-width:0}.stat b{display:block;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stat span{font-size:11px;color:var(--muted)}.controlbar{justify-content:space-between;margin-bottom:10px}.filters{display:flex;gap:6px;flex-wrap:wrap}.filters .btn{min-height:36px;padding:6px 10px;color:var(--muted)}.filters .btn.on{background:#176dce;border-color:#499fff;color:#fff}.filters small{margin-left:5px;padding:1px 5px;border-radius:99px;background:rgba(255,255,255,.1)}.sorter{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px}.sorter select{min-height:36px;padding:5px 8px}.grid{display:flex;flex-direction:column;gap:8px}.torrent{position:relative;display:grid;grid-template-columns:minmax(260px,1.45fr) minmax(290px,1fr) auto;align-items:center;gap:14px;padding:11px 12px;border-left:4px solid #53637a;transition:border-color .18s,background .18s}.torrent.changed{animation:changed .5s ease}.torrent[data-kind="downloading"]{border-left-color:var(--blue)}.torrent[data-kind="queued"]{border-left-color:var(--amber)}.torrent[data-kind="completed"],.torrent[data-kind="seeding"]{border-left-color:var(--green)}.torrent[data-kind="error"]{border-left-color:var(--red)}@keyframes changed{50%{background:#17263a}}.torrent-main{min-width:0;border:0;background:transparent;color:inherit;text-align:left;padding:0;cursor:pointer}.head{display:flex;align-items:flex-start;gap:8px}.name{min-width:0;flex:1;font-weight:800;line-height:1.3;overflow-wrap:anywhere}.status{flex:0 0 auto;font-size:10px;font-weight:800;padding:3px 7px;border:1px solid currentColor;border-radius:99px;color:#bdddff;white-space:nowrap}.meter{height:8px;margin-top:8px;background:#080d15;border:1px solid #263951;border-radius:99px;overflow:hidden}.fill{height:100%;width:0;background:linear-gradient(90deg,var(--blue),var(--blue2));transition:width .35s ease}.torrent[data-kind="completed"] .fill,.torrent[data-kind="seeding"] .fill{background:var(--green)}.torrent[data-kind="error"] .fill{background:var(--red)}.progressline{display:flex;align-items:baseline;gap:8px;margin-top:7px;color:var(--muted);font-size:11px}.progressline strong{color:var(--text);font-size:16px}.progressline .amount{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 12px;color:var(--muted);font-size:11px}.metrics b{color:var(--text)}.row-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px}.more{position:relative}.more>summary{list-style:none}.more>summary::-webkit-details-marker{display:none}.more-menu{position:absolute;z-index:25;right:0;top:calc(100% + 5px);width:210px;padding:7px;border:1px solid var(--line);border-radius:9px;background:#0b121e;box-shadow:var(--shadow)}.more-menu .btn,.more-menu select{width:100%;margin:2px 0;text-align:left}.detail{grid-column:1/-1;padding:12px 4px 2px;border-top:1px solid var(--line2)}.detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}.detail-fact{padding:8px;border:1px solid var(--line2);border-radius:7px;background:var(--panel2)}.detail-fact span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase}.detail-fact b{display:block;margin-top:3px;overflow-wrap:anywhere}.file-list{display:flex;flex-direction:column;gap:4px;max-height:310px;overflow:auto}.file-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;background:var(--panel2);font-size:11px}.file-row span{overflow-wrap:anywhere}.file-row select{min-height:32px;font-size:11px}.empty{padding:30px 18px;text-align:center;border:1px dashed var(--line);border-radius:9px;color:var(--muted);background:rgba(17,25,39,.72)}.empty strong{display:block;color:var(--text);font-size:17px;margin-bottom:5px}.notice{padding:12px;color:var(--muted)}#message{position:fixed;z-index:80;top:14px;right:14px;width:min(420px,calc(100vw - 28px));box-shadow:var(--shadow);pointer-events:none}.notice.error{border-color:#8a3942;color:#ffc2c7;background:#31171c}.login{width:min(480px,100%);margin:12vh auto;padding:24px}.login h2{margin:0 0 7px}.login p{color:var(--muted);line-height:1.45}.login label{display:block;font-size:12px;font-weight:700;margin:11px 0 5px}.login input{width:100%;padding:10px}.login .btn{width:100%;margin-top:14px}.history-intro{margin-bottom:10px}.history-tools input{flex:1;min-width:220px;padding:8px 10px}.history-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:11px}.history-card .meta{color:var(--muted);font-size:11px;margin-top:6px}.history-total{margin:10px 0;color:var(--muted);font-size:12px}@media(prefers-color-scheme:light){:root{color-scheme:light;--bg:#e8edf4;--panel:#f8fafc;--panel2:#eef3f8;--line:#afbdd0;--line2:#ccd6e3;--text:#142033;--muted:#5d6c82;--shadow:0 12px 30px rgba(25,45,72,.16)}body{background:rgba(232,237,244,.92)}.workspace{background:rgba(232,237,244,.95)}.btn,input,select,.more-menu{background:#f7f9fc}.segmented,.meter{background:#dfe7f1}.torrent.changed{animation:none}.status{color:#185f9e}}
@media(max-width:980px){.torrent{grid-template-columns:minmax(220px,1fr) minmax(230px,.8fr)}.row-actions{grid-column:1/-1;justify-content:flex-start}.detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:680px){.shell{padding:9px 10px 28px}.workspace{margin:0 -2px 10px;padding:8px 2px}.workspace-main h1{font-size:19px}.workspace-actions{width:100%}.commandbar{grid-template-columns:1fr}.add{flex-wrap:wrap}.add input{flex-basis:100%}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary .stat:last-child{grid-column:1/-1}.controlbar{align-items:flex-start}.filters{flex-wrap:nowrap;width:100%;overflow-x:auto;padding-bottom:4px}.filters .btn{flex:0 0 auto}.sorter{width:100%}.sorter select{flex:1}.torrent{display:block;padding:11px}.metrics{margin:9px 0}.row-actions{justify-content:space-between}.row-actions>.btn{flex:1}.more-menu{right:0}.detail{margin-top:10px}.detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.file-row{grid-template-columns:minmax(0,1fr) auto}.file-row select{grid-column:1/-1;width:100%}.history-card{grid-template-columns:1fr}#message{top:8px;right:8px;width:calc(100vw - 16px)}}
</style></head><body><main class="shell">
<section class="login hidden" id="login"><h2>Sign in to BiglyBT</h2><p>Sign in once on this device. Only an encrypted session token is saved; your password is never stored.</p><div id="loginError" class="notice error hidden"></div><form id="loginForm"><label for="user">Username</label><input id="user" autocomplete="username" required><label for="pass">Password</label><input id="pass" type="password" autocomplete="current-password" required><button class="btn blue">Sign in and remember</button></form></section>
<section id="dashboard" class="hidden"><header class="workspace"><div class="workspace-main"><h1>BiglyBT Downloads</h1><span class="connection" id="connection"><i></i><span>Connecting</span></span><div class="segmented" aria-label="BiglyBT view"><button class="btn on" type="button">Native</button><button class="btn" id="webUi" type="button">Web UI</button></div></div><div class="workspace-sub"><span><b id="headActive">0</b> active</span><span>Down <b id="headDown">0 B/s</b></span><span>Up <b id="headUp">0 B/s</b></span><span>Remaining <b id="headRemaining">0 B</b></span><span id="lastUpdated">Not updated</span></div></header>
<div class="commandbar"><form class="add" id="addForm"><input id="magnet" placeholder="Paste a magnet link" autocomplete="off" aria-label="Magnet link"><button class="btn" type="button" id="pasteMagnet">Paste &amp; Add</button><button class="btn blue">Add torrent</button></form><div class="workspace-actions"><button class="btn blue" id="refresh">Refresh</button><button class="btn" id="historyView">History</button><button class="btn" id="auto">Auto: On</button><button class="btn" id="speedMode">Speed limit: Off</button><button class="btn" id="autoRemove">Remove completed: On</button><button class="btn danger" id="forget">Forget login</button></div></div>
<div id="torrentView"><section class="summary" id="summary"></section><div class="controlbar"><nav class="filters" id="filters" aria-label="Torrent filters"><button class="btn on" data-filter="active">Active <small>0</small></button><button class="btn" data-filter="queued">Queued <small>0</small></button><button class="btn" data-filter="completed">Completed <small>0</small></button><button class="btn" data-filter="seeding">Seeding <small>0</small></button><button class="btn" data-filter="error">Errors <small>0</small></button><button class="btn" data-filter="all">All <small>0</small></button></nav><label class="sorter">Sort <select id="sort"><option value="queue">Queue position</option><option value="name">Name</option><option value="progress">Progress</option><option value="eta">ETA</option><option value="speed">Download speed</option><option value="size">Size</option><option value="added">Date added</option></select></label></div><div id="empty" class="empty hidden"></div><section class="grid" id="grid"></section></div>
<section id="historyPanel" class="hidden"><div class="notice history-intro">Completed and removed activity is retained as a report. Downloaded files are deleted only when you explicitly choose Remove and delete files.</div><div class="history-tools"><input id="historySearch" placeholder="Search history" aria-label="Search torrent history"><select id="historyOutcome"><option value="all">All outcomes</option><option value="completed">Completed</option><option value="removed">Removed</option><option value="deleted">Files deleted</option></select><select id="historyDate"><option value="all">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last year</option></select><button class="btn" id="historyExport">Export CSV</button></div><div class="history-total" id="historyTotal"></div><section class="grid" id="historyGrid"></section></section>
<div id="message" class="notice hidden" role="status" aria-live="polite"></div></section></main><script>
(function(){
var TOKEN_KEY='gvbt_native_token',AUTO_KEY='gvbt_native_auto',AUTO_REMOVE_KEY='gvbt_native_remove_completed',HISTORY_KEY='gvbt_native_history',SORT_KEY='gvbt_native_sort',IDLE_MS=300000,token='',auto=true,autoRemove=true,altSpeed=false,busy=false,timer=null,idleTimer=null,idle=false,lastActivity=Date.now(),currentFilter='active',sortMode='queue',allItems=[],historyItems=[],historyMode=false,previousItems={},knownRemoved={},expandedId='',detailCache={},toastTimer=null;
var grid=document.getElementById('grid'),message=document.getElementById('message'),summary=document.getElementById('summary'),empty=document.getElementById('empty');
try{token=localStorage.getItem(TOKEN_KEY)||'';auto=localStorage.getItem(AUTO_KEY)!=='0';autoRemove=localStorage.getItem(AUTO_REMOVE_KEY)!=='0';sortMode=localStorage.getItem(SORT_KEY)||'queue';historyItems=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(!Array.isArray(historyItems))historyItems=[]}catch(e){historyItems=[]}
document.getElementById('sort').value=sortMode;
function saveToken(value){token=value||'';try{if(token)localStorage.setItem(TOKEN_KEY,token);else localStorage.removeItem(TOKEN_KEY)}catch(e){}try{parent.postMessage({type:token?'gvbt-native-token-save':'gvbt-native-token-remove',token:token},'*')}catch(e){}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function bytes(n){n=Number(n)||0;var u=['B','KB','MB','GB','TB'],i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i?n.toFixed(n>=10?1:2):Math.round(n))+' '+u[i]}
function eta(n){n=Number(n);if(!isFinite(n)||n<0||n>31536000)return '--';if(n<60)return Math.round(n)+'s';if(n<3600)return Math.round(n/60)+'m';if(n<86400)return Math.floor(n/3600)+'h '+Math.round(n%3600/60)+'m';return Math.floor(n/86400)+'d '+Math.round(n%86400/3600)+'h'}
function dateText(n){n=Number(n)||0;return n?new Date(n*1000).toLocaleString():'--'}
function statusName(s){return ({0:'Stopped',1:'Check queued',2:'Checking',3:'Queued',4:'Downloading',5:'Seed queued',6:'Seeding'})[s]||'Unknown'}
function torrentKey(t){return String(t.hashString||t.id||t.name||'unknown')}
function progress(t){return Math.max(0,Math.min(100,(Number(t.percentDone)||0)*100))}
function totalSize(t){return Number(t.sizeWhenDone||t.totalSize)||0}
function downloaded(t){var total=totalSize(t),left=Number(t.leftUntilDone);return Number.isFinite(left)&&total?Math.max(0,total-left):(Number(t.downloadedEver)||Math.round(total*progress(t)/100))}
function kind(t){if(t.error||t.errorString)return'error';if(progress(t)>=100&&t.status===6)return'seeding';if(progress(t)>=100)return'completed';if(t.status===4)return'downloading';if(t.status===1||t.status===2||t.status===3||t.status===5)return'queued';return'stopped'}
function historyEntry(t,outcome,filesDeleted){var hash=String(t.hashString||''),id=(hash||String(t.id||t.name))+':'+String(outcome).toLowerCase().replace(/[^a-z0-9]+/g,'-');return{id:id,at:Date.now(),name:t.name||'Untitled torrent',outcome:outcome,progress:progress(t),downloaded:downloaded(t),total:totalSize(t),filesDeleted:!!filesDeleted,hash:hash}}
function saveHistory(){historyItems.sort(function(a,b){return(b.at||0)-(a.at||0)});historyItems=historyItems.slice(0,1000);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(historyItems))}catch(e){}}
function mergeHistory(items){var seen={};historyItems.concat(items||[]).forEach(function(x){if(x&&x.id&&!seen[x.id])seen[x.id]=x});historyItems=Object.keys(seen).map(function(k){return seen[k]});saveHistory();if(historyMode)renderHistory()}
function recordHistory(t,outcome,filesDeleted){var entry=historyEntry(t,outcome,filesDeleted);if(historyItems.some(function(x){return x.id===entry.id}))return;historyItems.unshift(entry);saveHistory();try{parent.postMessage({type:'gvbt-history-event',entry:entry},'*')}catch(e){}if(historyMode)renderHistory()}
function authHeaders(){return{'Content-Type':'application/json','Authorization':'Bearer '+token}}
function showLogin(error){document.getElementById('dashboard').classList.add('hidden');document.getElementById('login').classList.remove('hidden');var box=document.getElementById('loginError');box.textContent=error||'';box.classList.toggle('hidden',!error)}
function showDashboard(){document.getElementById('login').classList.add('hidden');document.getElementById('dashboard').classList.remove('hidden');updateAutoLabel();updateAutoRemoveLabel();updateSpeedLabel()}
async function rpc(method,args){var r=await fetch('/__native/api',{method:'POST',headers:authHeaders(),body:JSON.stringify({method:method,arguments:args||{}})}),j=await r.json().catch(function(){return{}});if(r.status===401){saveToken('');showLogin('Your saved login expired. Please sign in again.');throw new Error('Sign in required')}if(!r.ok||j.result!=='success')throw new Error(j.message||j.result||('Request failed '+r.status));return j.arguments||{}}
async function loadSession(){try{var s=await rpc('session-get',{});altSpeed=!!s['alt-speed-enabled'];updateSpeedLabel()}catch(e){}}
function connection(state,label){var el=document.getElementById('connection');el.className='connection '+state;el.querySelector('span').textContent=label}
function setMessage(text,error,persist){clearTimeout(toastTimer);message.textContent=text||'';message.className='notice'+(error?' error':'')+(text?'':' hidden');if(text&&!error&&!persist)toastTimer=setTimeout(function(){message.classList.add('hidden')},3200)}
function updateAutoLabel(){document.getElementById('auto').textContent=!auto?'Auto: Off':idle?'Auto: Paused':'Auto: On'}
function updateAutoRemoveLabel(){document.getElementById('autoRemove').textContent='Remove completed: '+(autoRemove?'On':'Off')}
function updateSpeedLabel(){document.getElementById('speedMode').textContent='Speed limit: '+(altSpeed?'On':'Off')}
function counts(items){var c={active:0,queued:0,completed:0,seeding:0,error:0,all:items.length};items.forEach(function(t){var k=kind(t);if(k==='downloading'||k==='seeding')c.active++;if(k==='queued')c.queued++;if(k==='completed')c.completed++;if(k==='seeding')c.seeding++;if(k==='error')c.error++});return c}
function filtered(items){return items.filter(function(t){var k=kind(t);if(currentFilter==='all')return true;if(currentFilter==='active')return k==='downloading'||k==='seeding';return k===currentFilter})}
function sorted(items){return items.slice().sort(function(a,b){if(sortMode==='name')return String(a.name||'').localeCompare(String(b.name||''));if(sortMode==='progress')return progress(b)-progress(a);if(sortMode==='eta')return(Number(a.eta)||1e15)-(Number(b.eta)||1e15);if(sortMode==='speed')return(Number(b.rateDownload)||0)-(Number(a.rateDownload)||0);if(sortMode==='size')return totalSize(b)-totalSize(a);if(sortMode==='added')return(Number(b.addedDate)||0)-(Number(a.addedDate)||0);return(Number(a.queuePosition)||999999)-(Number(b.queuePosition)||999999)})}
function primary(t){var k=kind(t);if(k==='downloading')return{method:'torrent-stop',label:'Pause'};if(k==='seeding')return{method:'torrent-stop',label:'Stop seeding'};if(k==='completed')return{method:'torrent-remove',label:'Remove',remove:'0'};return{method:'torrent-start',label:k==='queued'?'Start now':'Resume'}}
function createCard(t){var article=document.createElement('article');article.className='torrent';article.dataset.key=torrentKey(t);article.innerHTML='<button class="torrent-main" type="button" data-expand aria-expanded="false"><div class="head"><div class="name"></div><span class="status"></span></div><div class="meter"><div class="fill"></div></div><div class="progressline"><strong class="pct"></strong><span class="amount"></span><span class="eta"></span></div></button><div class="metrics"><span>Down <b class="down"></b></span><span>Up <b class="up"></b></span><span>Seeds <b class="seeds"></b></span><span>Peers <b class="peers"></b></span><span>Ratio <b class="ratio"></b></span><span>Queue <b class="queue"></b></span></div><div class="row-actions"><button class="btn blue primary" type="button"></button><details class="more"><summary class="btn" aria-label="More torrent actions">•••</summary><div class="more-menu"><select data-priority aria-label="Torrent priority"><option value="">Set priority…</option><option value="1">High priority</option><option value="0">Normal priority</option><option value="-1">Low priority</option></select><button class="btn" type="button" data-method="torrent-remove" data-delete="0">Remove, keep files</button><button class="btn danger" type="button" data-method="torrent-remove" data-delete="1">Delete torrent and files</button></div></details></div><section class="detail hidden"></section>';return article}
function patchCard(el,t){var sig=[t.status,progress(t).toFixed(1),downloaded(t),totalSize(t),t.eta,t.rateDownload,t.rateUpload,t.peersConnected,t.peersSendingToUs,t.uploadRatio,t.queuePosition,t.errorString].join('|');if(el.dataset.sig&&el.dataset.sig!==sig){el.classList.remove('changed');void el.offsetWidth;el.classList.add('changed')}el.dataset.sig=sig;el.dataset.id=String(t.id);el.dataset.kind=kind(t);el.querySelector('.name').textContent=t.name||'Untitled torrent';el.querySelector('.status').textContent=t.errorString||statusName(t.status);el.querySelector('.fill').style.width=progress(t).toFixed(1)+'%';el.querySelector('.pct').textContent=progress(t).toFixed(1)+'%';el.querySelector('.amount').textContent=bytes(downloaded(t))+' / '+bytes(totalSize(t));el.querySelector('.eta').textContent='ETA '+eta(t.eta);el.querySelector('.down').textContent=bytes(t.rateDownload)+'/s';el.querySelector('.up').textContent=bytes(t.rateUpload)+'/s';el.querySelector('.seeds').textContent=String(t.peersSendingToUs||0);el.querySelector('.peers').textContent=String(t.peersConnected||0);el.querySelector('.ratio').textContent=Number(t.uploadRatio||0).toFixed(2);el.querySelector('.queue').textContent=t.queuePosition==null?'--':String(t.queuePosition);var p=primary(t),btn=el.querySelector('.primary');btn.textContent=p.label;btn.dataset.method=p.method;btn.dataset.delete=p.remove||'';btn.dataset.id=String(t.id);el.querySelectorAll('[data-method="torrent-remove"]').forEach(function(b){b.dataset.id=String(t.id)});el.querySelector('[data-priority]').dataset.id=String(t.id);var open=expandedId===String(t.id),detail=el.querySelector('.detail');el.querySelector('[data-expand]').setAttribute('aria-expanded',open?'true':'false');detail.classList.toggle('hidden',!open);if(open&&detailCache[String(t.id)]&&!detail.dataset.loaded)renderDetail(detail,detailCache[String(t.id)],t)}
function updateOverview(items){var c=counts(items),down=items.reduce(function(n,t){return n+(Number(t.rateDownload)||0)},0),up=items.reduce(function(n,t){return n+(Number(t.rateUpload)||0)},0),remaining=items.reduce(function(n,t){return n+Math.max(0,totalSize(t)-downloaded(t))},0);summary.innerHTML='<div class="stat"><b>'+items.length+'</b><span>Total torrents</span></div><div class="stat"><b>'+c.active+'</b><span>Active downloads</span></div><div class="stat"><b>'+bytes(down)+'/s</b><span>Download speed</span></div><div class="stat"><b>'+bytes(up)+'/s</b><span>Upload speed</span></div><div class="stat"><b>'+bytes(remaining)+'</b><span>Remaining</span></div>';document.getElementById('headActive').textContent=c.active;document.getElementById('headDown').textContent=bytes(down)+'/s';document.getElementById('headUp').textContent=bytes(up)+'/s';document.getElementById('headRemaining').textContent=bytes(remaining);document.querySelectorAll('#filters [data-filter]').forEach(function(b){var n=b.querySelector('small');if(n)n.textContent=c[b.dataset.filter]||0})}
function render(items){allItems=items||[];updateOverview(allItems);var visible=sorted(filtered(allItems)),keep={};visible.forEach(function(t){var key=torrentKey(t),el=grid.querySelector('[data-key="'+CSS.escape(key)+'"]');if(!el)el=createCard(t);patchCard(el,t);grid.appendChild(el);keep[key]=1});Array.from(grid.children).forEach(function(el){if(!keep[el.dataset.key])el.remove()});empty.classList.toggle('hidden',visible.length>0);if(!visible.length){empty.innerHTML='<strong>No '+esc(currentFilter==='all'?'torrents':currentFilter+' torrents')+'</strong><span>Change the filter or add a magnet link.</span>'}}
function renderDetail(box,d,t){var files=Array.isArray(d.files)?d.files:[],stats=Array.isArray(d.fileStats)?d.fileStats:[],trackers=Array.isArray(d.trackers)?d.trackers:[];box.innerHTML='<div class="detail-grid"><div class="detail-fact"><span>Save location</span><b>'+esc(d.downloadDir||'--')+'</b></div><div class="detail-fact"><span>Added</span><b>'+esc(dateText(d.addedDate))+'</b></div><div class="detail-fact"><span>Completed</span><b>'+esc(dateText(d.doneDate))+'</b></div><div class="detail-fact"><span>Trackers</span><b>'+trackers.length+'</b></div></div><div class="file-list">'+(files.length?files.slice(0,40).map(function(f,i){var s=stats[i]||{},pct=f.length?Math.round((Number(f.bytesCompleted)||0)/f.length*100):0,priority=Number(s.priority)||0;return'<div class="file-row"><span>'+esc(f.name||('File '+(i+1)))+' · '+pct+'%</span><b>'+bytes(f.length)+'</b><select data-file-priority data-id="'+esc(t.id)+'" data-file-index="'+i+'" aria-label="Priority for '+esc(f.name||('file '+(i+1)))+'"><option value="1"'+(priority===1?' selected':'')+'>High</option><option value="0"'+(priority===0?' selected':'')+'>Normal</option><option value="-1"'+(priority===-1?' selected':'')+'>Low</option></select></div>'}).join('')+(files.length>40?'<div class="notice">'+(files.length-40)+' more files are available in Web UI.</div>':''):'<div class="notice">No file details returned.</div>')+'</div>';box.dataset.loaded='1'}
async function loadDetails(id){var box=grid.querySelector('[data-id="'+CSS.escape(String(id))+'"] .detail');if(box)box.innerHTML='<div class="notice">Loading torrent details…</div>';try{var r=await rpc('torrent-get',{ids:[Number(id)],fields:['id','downloadDir','addedDate','doneDate','startDate','files','fileStats','trackers','trackerStats','comment']}),d=(r.torrents||[])[0]||{};detailCache[String(id)]=d;var item=allItems.find(function(t){return Number(t.id)===Number(id)});if(box&&item)renderDetail(box,d,item)}catch(e){if(box)box.innerHTML='<div class="notice error">'+esc(e.message||'Unable to load details.')+'</div>'}}
function trackMissing(items){var current={};items.forEach(function(t){current[torrentKey(t)]=t});Object.keys(previousItems).forEach(function(k){if(!current[k]&&!knownRemoved[k]){var old=previousItems[k],done=progress(old)>=100;recordHistory(old,done?'Completed - removed outside GameVault':'Removed outside GameVault before completion',false)}delete knownRemoved[k]});return current}
async function load(silent){if(busy||!token)return;busy=true;connection('','Updating');var refresh=document.getElementById('refresh');if(!silent)refresh.disabled=true;try{var fields=['id','hashString','name','status','percentDone','eta','rateDownload','rateUpload','peersConnected','peersGettingFromUs','peersSendingToUs','totalSize','sizeWhenDone','leftUntilDone','downloadedEver','uploadRatio','queuePosition','isFinished','error','errorString','addedDate'];var result=await rpc('torrent-get',{fields:fields}),items=result.torrents||[],current=trackMissing(items),finished=items.filter(function(t){return(t.isFinished===true||Number(t.percentDone)>=1)&&totalSize(t)>0});finished.forEach(function(t){recordHistory(t,autoRemove?'Completed - automatically removed':'Completed',false)});var completed=autoRemove?finished:[];if(completed.length){await rpc('torrent-stop',{ids:completed.map(function(t){return t.id})});await rpc('torrent-remove',{ids:completed.map(function(t){return t.id}),'delete-local-data':false});result=await rpc('torrent-get',{fields:fields});items=result.torrents||[];current={};items.forEach(function(t){current[torrentKey(t)]=t});setMessage('Removed '+completed.length+' completed torrent'+(completed.length===1?'':'s')+'. Downloaded files were kept.',false)}previousItems=current;render(items);connection('online','Connected');if(message.classList.contains('error'))setMessage('',false);document.getElementById('lastUpdated').textContent='Updated '+new Date().toLocaleTimeString()}catch(e){connection('offline','Offline');setMessage(e.message||'Unable to load torrents.',true,true)}finally{busy=false;if(!silent)refresh.disabled=false}}
function stopPolling(){if(timer){clearTimeout(timer);timer=null}}function stopIdleTimer(){if(idleTimer){clearTimeout(idleTimer);idleTimer=null}}
function armIdleTimer(){stopIdleTimer();var remaining=IDLE_MS-(Date.now()-lastActivity);if(remaining<=0){idle=true;stopPolling();connection('','Refresh paused');updateAutoLabel();return}idleTimer=setTimeout(function(){idle=true;stopPolling();connection('','Refresh paused');updateAutoLabel();setMessage('Auto-refresh paused after 5 minutes. Click anywhere to resume.',false,true)},remaining)}
function schedulePolling(){stopPolling();if(auto&&!idle&&token&&!document.hidden)timer=setTimeout(async function(){await load(true);schedulePolling()},2000)}async function activate(){if(!auto||idle||!token||document.hidden)return;await loadSession();await load();schedulePolling()}function registerActivity(){lastActivity=Date.now();var wasIdle=idle;idle=false;updateAutoLabel();armIdleTimer();if(wasIdle){setMessage('Auto-refresh resumed.',false);activate()}}
function renderHistory(){var q=document.getElementById('historySearch').value.trim().toLowerCase(),out=document.getElementById('historyOutcome').value,days=document.getElementById('historyDate').value,cutoff=days==='all'?0:Date.now()-Number(days)*86400000,items=historyItems.filter(function(h){if(q&&String(h.name||'').toLowerCase().indexOf(q)<0)return false;if(cutoff&&Number(h.at||0)<cutoff)return false;var o=String(h.outcome||'').toLowerCase();if(out==='completed'&&o.indexOf('completed')<0)return false;if(out==='removed'&&o.indexOf('removed')<0)return false;if(out==='deleted'&&!h.filesDeleted)return false;return true}),total=items.reduce(function(n,h){return n+(Number(h.downloaded)||0)},0),box=document.getElementById('historyGrid');document.getElementById('historyTotal').textContent=items.length+' records · '+bytes(total)+' downloaded';box.innerHTML=items.length?items.map(function(h){return'<article class="history-card"><div><div class="head"><div class="name">'+esc(h.name)+'</div><span class="status">'+esc(h.outcome)+'</span></div><div class="meta">'+new Date(h.at||Date.now()).toLocaleString()+' · '+bytes(h.downloaded)+' / '+bytes(h.total)+'</div></div><b>'+(h.filesDeleted?'Files deleted':'Files kept')+'</b></article>'}).join(''):'<div class="empty"><strong>No matching history</strong><span>Change the search, outcome or date filter.</span></div>'}
function setHistoryMode(on){historyMode=!!on;document.getElementById('torrentView').classList.toggle('hidden',historyMode);document.getElementById('historyPanel').classList.toggle('hidden',!historyMode);document.getElementById('historyView').textContent=historyMode?'Back to torrents':'History';if(historyMode)renderHistory()}
async function action(button){var method=button.dataset.method,id=Number(button.dataset.id),args={ids:[id]},item=allItems.find(function(t){return Number(t.id)===id});if(method==='torrent-remove'){var removeFiles=button.dataset.delete==='1',label=item?(item.name||'this torrent'):'this torrent';if(!confirm((removeFiles?'Permanently delete ':'Remove ')+label+' ('+bytes(item?totalSize(item):0)+')?\\n\\n'+(removeFiles?'The downloaded files will also be deleted. This cannot be undone.':'The downloaded files will be kept.')))return;args['delete-local-data']=removeFiles}button.disabled=true;try{await rpc(method,args);if(method==='torrent-remove'&&item){knownRemoved[torrentKey(item)]=1;recordHistory(item,progress(item)>=100?'Completed - manually removed':'Manually removed before completion',button.dataset.delete==='1')}await load(true)}catch(e){setMessage(e.message||'Action failed.',true,true)}finally{button.disabled=false}}
grid.onclick=function(e){var expand=e.target.closest('[data-expand]');if(expand){var card=expand.closest('.torrent'),id=card.dataset.id;expandedId=expandedId===id?'':id;render(allItems);if(expandedId&&!detailCache[id])loadDetails(id);return}var b=e.target.closest('button[data-method]');if(b)action(b)};
grid.onchange=async function(e){var s=e.target.closest('[data-priority]');if(s&&s.value!==''){try{await rpc('torrent-set',{ids:[Number(s.dataset.id)],bandwidthPriority:Number(s.value)});setMessage('Torrent priority updated.',false);s.value=''}catch(err){setMessage(err.message,true,true)}return}var f=e.target.closest('[data-file-priority]');if(f){var key=Number(f.value)===1?'priority-high':Number(f.value)===-1?'priority-low':'priority-normal',args={ids:[Number(f.dataset.id)]};args[key]=[Number(f.dataset.fileIndex)];try{await rpc('torrent-set',args);setMessage('File priority updated.',false)}catch(err){setMessage(err.message,true,true)}}};
async function addMagnet(url){var input=document.getElementById('magnet');url=String(url||'').trim();if(!/^magnet:\\?/i.test(url)){setMessage('Clipboard does not contain a valid magnet link.',true,true);return}try{await rpc('torrent-add',{filename:url});input.value='';setMessage('Torrent added.',false);await load(true)}catch(err){setMessage(err.message||'Could not add torrent.',true,true)}}
document.getElementById('refresh').onclick=function(){load(false)};document.getElementById('addForm').onsubmit=function(e){e.preventDefault();addMagnet(document.getElementById('magnet').value)};document.getElementById('pasteMagnet').onclick=async function(){var button=this;button.disabled=true;try{if(!navigator.clipboard||!navigator.clipboard.readText)throw new Error('Clipboard access is unavailable in this browser.');var text=await navigator.clipboard.readText(),match=String(text||'').match(/magnet:\\?[^\\s]+/i);if(!match)throw new Error('Clipboard does not contain a magnet link.');document.getElementById('magnet').value=match[0];await addMagnet(match[0])}catch(err){setMessage((err&&err.message)||'Allow clipboard access and try again.',true,true)}finally{button.disabled=false}};
document.getElementById('filters').onclick=function(e){var b=e.target.closest('[data-filter]');if(!b)return;currentFilter=b.dataset.filter;document.querySelectorAll('#filters [data-filter]').forEach(function(x){x.classList.toggle('on',x===b)});render(allItems)};document.getElementById('sort').onchange=function(e){sortMode=e.target.value;try{localStorage.setItem(SORT_KEY,sortMode)}catch(x){}render(allItems)};
document.getElementById('loginForm').onsubmit=async function(e){e.preventDefault();var error=document.getElementById('loginError');error.classList.add('hidden');try{var r=await fetch('/__native/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('user').value.trim(),password:document.getElementById('pass').value})}),j=await r.json().catch(function(){return{}});if(!r.ok||!j.token)throw new Error(j.message||'Login failed');saveToken(j.token);document.getElementById('pass').value='';showDashboard();activate()}catch(err){showLogin(err.message||'Login failed')}};
document.getElementById('forget').onclick=function(){if(!confirm('Forget the saved BiglyBT login on this device?'))return;stopPolling();stopIdleTimer();saveToken('');showLogin('Saved login removed from this device.')};document.getElementById('historyView').onclick=function(){setHistoryMode(!historyMode)};document.getElementById('auto').onclick=function(){if(idle){registerActivity();return}auto=!auto;try{localStorage.setItem(AUTO_KEY,auto?'1':'0')}catch(e){}updateAutoLabel();if(auto)activate();else{stopPolling();connection('','Auto-refresh off')}};document.getElementById('autoRemove').onclick=function(){if(!autoRemove&&!confirm('Automatically remove every completed torrent from BiglyBT? Downloaded files will be kept.'))return;autoRemove=!autoRemove;try{localStorage.setItem(AUTO_REMOVE_KEY,autoRemove?'1':'0')}catch(e){}updateAutoRemoveLabel();if(autoRemove)load(false)};
document.getElementById('speedMode').onclick=async function(){try{altSpeed=!altSpeed;await rpc('session-set',{'alt-speed-enabled':altSpeed});updateSpeedLabel();setMessage('Alternative speed limits '+(altSpeed?'enabled.':'disabled.'),false)}catch(e){altSpeed=!altSpeed;updateSpeedLabel();setMessage(e.message||'Unable to change speed limits.',true,true)}};
document.getElementById('webUi').onclick=function(){if(!token)return showLogin('Sign in first.');if(parent!==window){parent.postMessage({type:'gvbt-switch-mode',mode:'iframe'},'*');return}location.href='/__native/web/'+encodeURIComponent(token)+'/'};document.getElementById('historySearch').oninput=renderHistory;document.getElementById('historyOutcome').onchange=renderHistory;document.getElementById('historyDate').onchange=renderHistory;document.getElementById('historyExport').onclick=function(){var rows=[['Date','Name','Outcome','Progress','Downloaded','Total','Files deleted']].concat(historyItems.map(function(h){return[new Date(h.at||Date.now()).toISOString(),h.name,h.outcome,h.progress,h.downloaded,h.total,h.filesDeleted?'Yes':'No']})),csv=rows.map(function(r){return r.map(function(v){return'"'+String(v==null?'':v).replace(/"/g,'""')+'"'}).join(',')}).join('\\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='gamevault-biglybt-history.csv';a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},1000)};
window.addEventListener('message',function(e){if(e.data&&e.data.type==='gvbt-native-token-response'&&!token&&typeof e.data.token==='string'&&e.data.token){saveToken(e.data.token);showDashboard();activate()}else if(e.data&&e.data.type==='gvbt-history-response'&&Array.isArray(e.data.items)){mergeHistory(e.data.items)}});try{parent.postMessage({type:'gvbt-native-token-request'},'*');parent.postMessage({type:'gvbt-history-request'},'*')}catch(e){}if(token){showDashboard();activate()}else setTimeout(function(){if(!token)showLogin('')},500);armIdleTimer();document.addEventListener('click',registerActivity);document.addEventListener('keydown',function(e){registerActivity();if(e.key==='r'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();load(false)}});document.addEventListener('visibilitychange',function(){if(document.hidden){stopPolling();return}if(Date.now()-lastActivity>=IDLE_MS){idle=true;stopPolling();connection('','Refresh paused');updateAutoLabel()}else{armIdleTimer();activate()}});
})();
</script></body></html>`;
}

async function nativeRpc(request, env, credentials) {
  const payload = await request.text();
  if (!payload || payload.length > 128 * 1024) {
    return Response.json({ result: "Invalid request", message: "The RPC request is empty or too large." }, { status: 400 });
  }
  const makeRequest = (sessionId) => new Request(new URL("/transmission/rpc", request.url), {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, sessionId ? { "X-Transmission-Session-Id": sessionId } : {}),
    body: payload
  });
  let response = await upstreamFetch(makeRequest(""), env, credentials, null);
  if (response.status === 409) {
    const sessionId = response.headers.get("X-Transmission-Session-Id");
    if (sessionId) response = await upstreamFetch(makeRequest(sessionId), env, credentials, null);
  }
  const headers = new Headers({ "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" });
  return new Response(response.body, { status: response.status, headers });
}

async function nativeWebProxy(request, env, credentials, token, upstreamPath) {
  const incoming = new URL(request.url);
  const path = (upstreamPath || "/") + incoming.search;
  const init = { method: request.method, headers: request.headers };
  if (requestBodyAllowed(request.method)) init.body = await request.arrayBuffer();
  const proxyRequest = new Request(new URL(path, incoming.origin), init);
  const response = await upstreamFetch(proxyRequest, env, credentials, null);
  const headers = new Headers(response.headers);
  const routeBase = `/__native/web/${encodeURIComponent(token)}`;
  const location = headers.get("Location");
  if (location) {
    const upstreamBase = new URL(env.UPSTREAM_URL);
    const resolved = new URL(location, upstreamBase);
    if (resolved.origin === upstreamBase.origin) {
      headers.set("Location", `${routeBase}${resolved.pathname}${resolved.search}${resolved.hash}`);
    }
  }
  headers.delete("X-Frame-Options");
  headers.delete("Content-Security-Policy");
  headers.set("Content-Security-Policy", "frame-ancestors https://sinuksml.github.io");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cache-Control", "no-store");
  headers.set("X-GameVault-Worker-Version", WORKER_VERSION);

  const contentType = (headers.get("Content-Type") || "").toLowerCase();
  const rewritable = contentType.includes("text/html") || contentType.includes("text/css") || contentType.includes("javascript");
  if (!rewritable || response.body == null || [204, 205, 304].includes(response.status)) {
    return new Response(response.body, { status: response.status, headers });
  }
  let text = await response.text();
  text = text
    .replace(/(["'])\/(?!\/)/g, `$1${routeBase}/`)
    .replace(/url\(\s*\/(?!\/)/gi, `url(${routeBase}/`);
  headers.delete("Content-Length");
  return new Response(text, { status: response.status, headers });
}

function loginResponse(message, isError, status, returnTo) {
  return new Response(htmlPage(message, isError, returnTo), {
    status: status || 200,
    headers: frameHeaders({ "Content-Type": "text/html; charset=utf-8" })
  });
}

export default {
  async fetch(request, env) {
    if (!env.UPSTREAM_URL) {
      return loginResponse("UPSTREAM_URL is not configured in Cloudflare.", true, 503);
    }
    if (!env.COOKIE_SECRET || env.COOKIE_SECRET.length < 32) {
      return loginResponse("COOKIE_SECRET is not configured. Add a Cloudflare secret containing at least 32 random characters.", true, 503);
    }

    const incoming = new URL(request.url);
    const requestedNative = incoming.pathname === "/__native" || incoming.pathname === "/__native/api";

    if (incoming.pathname === "/__logout") {
      return new Response(null, {
        status: 302,
        headers: frameHeaders({ "Location": "/", "Set-Cookie": sessionCookie("deleted", 0) })
      });
    }

    if (incoming.pathname === "/__login" && request.method === "POST") {
      const form = await request.formData();
      const credentials = {
        username: String(form.get("username") || "").trim(),
        password: String(form.get("password") || "")
      };
      if (!credentials.username || !credentials.password) {
        return loginResponse("Enter both the username and password.", true, 400, incoming.searchParams.get("next"));
      }

      let test;
      try {
        test = await upstreamFetch(request, env, credentials, "/");
      } catch (_) {
        return loginResponse("BiglyBT is offline or the upstream address cannot be reached.", true, 502, incoming.searchParams.get("next"));
      }
      if (test.status === 401) return loginResponse("Incorrect BiglyBT username or password.", true, 401, incoming.searchParams.get("next"));
      if (test.status === 403) return loginResponse("BiglyBT rejected the remote connection (403). Check its Web Remote access settings.", true, 403, incoming.searchParams.get("next"));
      if (test.status >= 500) return loginResponse(`BiglyBT returned server error ${test.status}.`, true, 502, incoming.searchParams.get("next"));

      const sealed = await sealSession(credentials, env.COOKIE_SECRET);
      const next = incoming.searchParams.get("next") === "/__native" ? "/__native" : "/";
      return new Response(null, {
        status: 302,
        headers: frameHeaders({ "Location": next, "Set-Cookie": sessionCookie(sealed, 2592000) })
      });
    }

    if (incoming.pathname === "/__native") {
      return new Response(nativeDashboardPage(), {
        headers: frameHeaders({ "Content-Type": "text/html; charset=utf-8" })
      });
    }
    const nativeWebMatch = incoming.pathname.match(/^\/__native\/web\/([^/]+)(\/.*)?$/);
    if (nativeWebMatch) {
      let token;
      try { token = decodeURIComponent(nativeWebMatch[1]); } catch (_) { return new Response("Invalid session", { status: 400 }); }
      const credentials = await openSession(token, env.COOKIE_SECRET);
      if (!credentials) return loginResponse("Your saved native login has expired. Return to the native dashboard and sign in again.", true, 401);
      try {
        return await nativeWebProxy(request, env, credentials, token, nativeWebMatch[2] || "/");
      } catch (_) {
        return loginResponse("BiglyBT Web UI is offline or unreachable.", true, 502);
      }
    }
    if (incoming.pathname === "/__native/login") {
      if (request.method !== "POST") return Response.json({ message: "Method not allowed" }, { status: 405 });
      const origin = request.headers.get("Origin");
      if (origin && origin !== incoming.origin) return Response.json({ message: "Origin not allowed" }, { status: 403 });
      let supplied;
      try {
        supplied = await request.json();
      } catch (_) {
        return Response.json({ message: "Invalid login request" }, { status: 400 });
      }
      const credentials = {
        username: String(supplied.username || "").trim(),
        password: String(supplied.password || "")
      };
      if (!credentials.username || !credentials.password) {
        return Response.json({ message: "Enter both the username and password." }, { status: 400 });
      }
      try {
        const test = await upstreamFetch(request, env, credentials, "/");
        if (test.status === 401) return Response.json({ message: "Incorrect BiglyBT username or password." }, { status: 401 });
        if (test.status === 403) return Response.json({ message: "BiglyBT rejected the remote connection." }, { status: 403 });
        if (test.status >= 400) return Response.json({ message: `BiglyBT returned status ${test.status}.` }, { status: 502 });
      } catch (_) {
        return Response.json({ message: "BiglyBT is offline or unreachable." }, { status: 502 });
      }
      return Response.json({ token: await sealSession(credentials, env.COOKIE_SECRET) }, {
        headers: { "Cache-Control": "no-store" }
      });
    }
    if (incoming.pathname === "/__native/api") {
      if (request.method !== "POST") return Response.json({ message: "Method not allowed" }, { status: 405 });
      const origin = request.headers.get("Origin");
      if (origin && origin !== incoming.origin) return Response.json({ message: "Origin not allowed" }, { status: 403 });
      const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
      const sealed = bearer ? bearer[1] : cookieValue(request, SESSION_COOKIE);
      const credentials = sealed ? await openSession(sealed, env.COOKIE_SECRET) : null;
      if (!credentials) return Response.json({ message: "Sign in required" }, { status: 401 });
      try {
        return await nativeRpc(request, env, credentials);
      } catch (_) {
        return Response.json({ result: "error", message: "BiglyBT is offline or the RPC service is unavailable." }, { status: 502 });
      }
    }

    const sealed = cookieValue(request, SESSION_COOKIE);
    const credentials = sealed ? await openSession(sealed, env.COOKIE_SECRET) : null;
    if (!credentials) return loginResponse("", false, 200, requestedNative ? "/__native" : "/");

    let response;
    try {
      response = await upstreamFetch(request, env, credentials, null);
    } catch (_) {
      return loginResponse("BiglyBT is offline or unreachable.", true, 502);
    }

    if (response.status === 401 || response.status === 403) {
      return new Response(htmlPage("Your BiglyBT session was rejected. Sign in again.", true), {
        status: 401,
        headers: frameHeaders({
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": sessionCookie("deleted", 0)
        })
      });
    }

    const headers = new Headers(response.headers);
    headers.delete("X-Frame-Options");
    headers.delete("Content-Security-Policy");
    headers.set("Content-Security-Policy", "frame-ancestors https://sinuksml.github.io");
    headers.set("Cache-Control", "no-store");
    headers.set("X-GameVault-Worker-Version", WORKER_VERSION);
    const location = headers.get("Location");
    if (location) {
      const upstreamBase = new URL(env.UPSTREAM_URL);
      headers.set("Location", location.replace(upstreamBase.origin, incoming.origin));
    }
    return new Response(response.body, { status: response.status, headers });
  }
};
