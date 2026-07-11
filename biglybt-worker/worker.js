import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_COOKIE = "gvbt_session";
const WORKER_VERSION = "github-v9";
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

function nativeDashboardPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BiglyBT Dashboard</title><style>
:root{color-scheme:dark;--bg:#090d14;--panel:#111927;--line:#2a3c58;--text:#eef4ff;--muted:#94a3ba;--blue:#2182ee;--danger:#e25261}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.shell{max-width:1500px;margin:auto;padding:18px}.top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}.top h1{font-size:22px;margin:0 auto 0 0}.btn,input,select{border:1px solid var(--line);border-radius:8px;background:#0b121e;color:var(--text);font:inherit}.btn{padding:9px 12px;cursor:pointer;font-weight:700}.btn:hover{border-color:#5da8ff}.btn.blue{background:#176dce;border-color:#499fff}.btn.danger{color:#ffb5bc;border-color:#74343c}.btn:disabled{opacity:.45;cursor:not-allowed}.add{display:flex;gap:8px;margin-bottom:12px}.add input{flex:1;min-width:0;padding:10px 12px}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.stat,.card,.notice,.login{border:1px solid var(--line);border-radius:9px;background:var(--panel)}.stat{padding:10px}.stat b{display:block;font-size:17px}.stat span{font-size:11px;color:var(--muted)}.grid{display:flex;flex-direction:column;gap:8px}.card{padding:11px;display:grid;grid-template-columns:minmax(220px,1.5fr) minmax(180px,1fr) auto;gap:10px;align-items:center}.head{display:flex;gap:8px;align-items:flex-start}.name{font-weight:800;line-height:1.3;overflow-wrap:anywhere;flex:1}.status{font-size:10px;font-weight:800;padding:3px 7px;border:1px solid #3778bf;border-radius:999px;color:#bdddff;white-space:nowrap}.meter{height:8px;background:#080d15;border:1px solid #263951;border-radius:999px;overflow:hidden;margin-top:8px}.fill{height:100%;background:linear-gradient(90deg,#2182ee,#58d4ff)}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;color:var(--muted);font-size:11px}.meta b{color:var(--text)}.actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.actions .btn,.actions select{font-size:11px;padding:7px 8px}.notice{padding:16px;text-align:center;color:var(--muted)}.error{border-color:#8a3942;color:#ffb5bc;background:#31171c}.login{width:min(460px,100%);margin:12vh auto;padding:22px}.login h2{margin:0 0 7px}.login p{color:var(--muted);line-height:1.45}.login label{display:block;font-size:12px;font-weight:700;margin:11px 0 5px}.login input{width:100%;padding:11px}.login .btn{width:100%;margin-top:14px}.hidden{display:none!important}@media(max-width:850px){.card{grid-template-columns:1fr}.actions{justify-content:flex-start}}@media(max-width:650px){.shell{padding:9px}.summary{grid-template-columns:repeat(2,1fr)}.add{flex-wrap:wrap}.add input{flex-basis:100%}.top h1{flex-basis:100%}.card{padding:10px}}
</style></head><body><main class="shell"><section class="login hidden" id="login"><h2>Sign in to BiglyBT</h2><p>Sign in once on this device. Only an encrypted session token is saved; your password is never stored.</p><div id="loginError" class="notice error hidden"></div><form id="loginForm"><label>Username</label><input id="user" autocomplete="username" required><label>Password</label><input id="pass" type="password" autocomplete="current-password" required><button class="btn blue">Sign in and remember</button></form></section><section id="dashboard" class="hidden"><div class="top"><h1>Native BiglyBT Dashboard <small style="font-size:11px;color:var(--muted)">List view</small></h1><button class="btn blue" id="refresh">Refresh</button><button class="btn" id="auto">Auto: On</button><a class="btn" href="/">Web UI</a><button class="btn danger" id="forget">Forget saved login</button></div><form class="add" id="addForm"><input id="magnet" placeholder="Paste a magnet link" autocomplete="off"><button class="btn blue">Add torrent</button></form><section class="summary" id="summary"></section><div id="message" class="notice">Loading torrents...</div><section class="grid" id="grid"></section></section></main><script>
(function(){
var TOKEN_KEY='gvbt_native_token',AUTO_KEY='gvbt_native_auto',token='',auto=true,busy=false,timer=null,grid=document.getElementById('grid'),message=document.getElementById('message'),summary=document.getElementById('summary');try{token=localStorage.getItem(TOKEN_KEY)||'';auto=localStorage.getItem(AUTO_KEY)!=='0'}catch(e){}function saveToken(value){token=value||'';try{if(token)localStorage.setItem(TOKEN_KEY,token);else localStorage.removeItem(TOKEN_KEY)}catch(e){}try{parent.postMessage({type:token?'gvbt-native-token-save':'gvbt-native-token-remove',token:token},'*')}catch(e){}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function bytes(n){n=Number(n)||0;var u=['B','KB','MB','GB','TB'],i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i?n.toFixed(n>=10?1:2):Math.round(n))+' '+u[i]}
function eta(n){n=Number(n);if(!isFinite(n)||n<0||n>31536000)return '--';if(n<60)return Math.round(n)+'s';if(n<3600)return Math.round(n/60)+'m';if(n<86400)return Math.floor(n/3600)+'h '+Math.round(n%3600/60)+'m';return Math.floor(n/86400)+'d '+Math.round(n%86400/3600)+'h'}
function statusName(s){return ({0:'Stopped',1:'Checking queued',2:'Checking',3:'Queued',4:'Downloading',5:'Seed queued',6:'Seeding'})[s]||'Unknown'}
function authHeaders(){return {'Content-Type':'application/json','Authorization':'Bearer '+token}}
function showLogin(error){document.getElementById('dashboard').classList.add('hidden');document.getElementById('login').classList.remove('hidden');var box=document.getElementById('loginError');box.textContent=error||'';box.classList.toggle('hidden',!error)}
function showDashboard(){document.getElementById('login').classList.add('hidden');document.getElementById('dashboard').classList.remove('hidden');document.getElementById('auto').textContent='Auto: '+(auto?'On':'Off')}
async function rpc(method,args){var r=await fetch('/__native/api',{method:'POST',headers:authHeaders(),body:JSON.stringify({method:method,arguments:args||{}})});var j=await r.json().catch(function(){return {}});if(r.status===401){saveToken('');showLogin('Your saved login expired. Please sign in again.');throw new Error('Sign in required')}if(!r.ok||j.result!=='success')throw new Error(j.message||j.result||('Request failed '+r.status));return j.arguments||{}}
function setMessage(text,error){message.textContent=text;message.className='notice'+(error?' error':'');message.classList.toggle('hidden',!text)}
function render(items){var active=items.filter(function(t){return t.status===4||t.status===6}).length,down=items.reduce(function(n,t){return n+(Number(t.rateDownload)||0)},0),up=items.reduce(function(n,t){return n+(Number(t.rateUpload)||0)},0);summary.innerHTML='<div class="stat"><b>'+items.length+'</b><span>Total torrents</span></div><div class="stat"><b>'+active+'</b><span>Active</span></div><div class="stat"><b>'+bytes(down)+'/s</b><span>Download speed</span></div><div class="stat"><b>'+bytes(up)+'/s</b><span>Upload speed</span></div>';if(!items.length){grid.innerHTML='';setMessage('No torrents found.',false);return}setMessage('',false);grid.innerHTML=items.map(function(t){var p=Math.max(0,Math.min(100,(Number(t.percentDone)||0)*100));return '<article class="card"><div><div class="head"><div class="name">'+esc(t.name||'Untitled torrent')+'</div><span class="status">'+esc(statusName(t.status))+'</span></div><div class="meter"><div class="fill" style="width:'+p.toFixed(1)+'%"></div></div></div><div class="meta"><div>Progress <b>'+p.toFixed(1)+'%</b></div><div>ETA <b>'+eta(t.eta)+'</b></div><div>Down <b>'+bytes(t.rateDownload)+'/s</b></div><div>Up <b>'+bytes(t.rateUpload)+'/s</b></div><div>Seeds <b>'+esc(t.peersGettingFromUs||0)+'</b></div><div>Peers <b>'+esc(t.peersConnected||0)+'</b></div><div>Size <b>'+bytes(t.totalSize||t.sizeWhenDone)+'</b></div><div>Ratio <b>'+Number(t.uploadRatio||0).toFixed(2)+'</b></div></div><div class="actions"><button class="btn" data-method="torrent-start" data-id="'+esc(t.id)+'">Start</button><button class="btn" data-method="torrent-stop" data-id="'+esc(t.id)+'">Pause</button><select data-priority="'+esc(t.id)+'"><option value="">Priority</option><option value="1">High</option><option value="0">Normal</option><option value="-1">Low</option></select><button class="btn danger" data-method="torrent-remove" data-id="'+esc(t.id)+'" data-delete="0">Remove</button><button class="btn danger" data-method="torrent-remove" data-id="'+esc(t.id)+'" data-delete="1">Remove + files</button></div></article>'}).join('')}
async function load(silent){if(busy||!token)return;busy=true;document.getElementById('refresh').disabled=true;if(!silent)setMessage('Refreshing torrents...',false);try{var fields=['id','name','status','percentDone','eta','rateDownload','rateUpload','peersConnected','peersGettingFromUs','peersSendingToUs','totalSize','sizeWhenDone','uploadRatio','queuePosition','isFinished','error','errorString'];var result=await rpc('torrent-get',{fields:fields});render(result.torrents||[])}catch(e){if(token)setMessage(e.message||'Unable to load torrents.',true)}finally{busy=false;document.getElementById('refresh').disabled=false}}
function stopPolling(){if(timer){clearTimeout(timer);timer=null}}
function schedulePolling(){stopPolling();if(auto&&token&&!document.hidden)timer=setTimeout(async function(){await load(true);schedulePolling()},2000)}
async function activate(){if(!auto||!token||document.hidden)return;await load();schedulePolling()}
document.getElementById('refresh').onclick=function(){load(false)};document.getElementById('addForm').onsubmit=async function(e){e.preventDefault();var input=document.getElementById('magnet'),url=input.value.trim();if(!url)return;try{await rpc('torrent-add',{filename:url});input.value='';await load()}catch(err){setMessage(err.message,true)}};
grid.onclick=async function(e){var b=e.target.closest('button[data-method]');if(!b)return;var method=b.dataset.method,id=Number(b.dataset.id),args={ids:[id]};if(method==='torrent-remove'){var removeFiles=b.dataset.delete==='1';if(!confirm(removeFiles?'Remove this torrent and permanently delete its downloaded files?':'Remove this torrent from BiglyBT but keep its downloaded files?'))return;args['delete-local-data']=removeFiles}try{await rpc(method,args);await load()}catch(err){setMessage(err.message,true)}};
grid.onchange=async function(e){var s=e.target.closest('select[data-priority]');if(!s||s.value==='')return;try{await rpc('torrent-set',{ids:[Number(s.dataset.priority)],bandwidthPriority:Number(s.value)});await load()}catch(err){setMessage(err.message,true)}};
document.getElementById('loginForm').onsubmit=async function(e){e.preventDefault();var error=document.getElementById('loginError');error.classList.add('hidden');try{var r=await fetch('/__native/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('user').value.trim(),password:document.getElementById('pass').value})}),j=await r.json().catch(function(){return {}});if(!r.ok||!j.token)throw new Error(j.message||'Login failed');saveToken(j.token);document.getElementById('pass').value='';showDashboard();activate()}catch(err){showLogin(err.message||'Login failed')}};
document.getElementById('forget').onclick=function(){stopPolling();saveToken('');showLogin('Saved login removed from this device.')};document.getElementById('auto').onclick=function(){auto=!auto;try{localStorage.setItem(AUTO_KEY,auto?'1':'0')}catch(e){}this.textContent='Auto: '+(auto?'On':'Off');if(auto)activate();else stopPolling()};
window.addEventListener('message',function(e){if(e.data&&e.data.type==='gvbt-native-token-response'&&!token&&typeof e.data.token==='string'&&e.data.token){saveToken(e.data.token);showDashboard();activate()}});try{parent.postMessage({type:'gvbt-native-token-request'},'*')}catch(e){}if(token){showDashboard();activate()}else setTimeout(function(){if(!token)showLogin('')},500);document.addEventListener('visibilitychange',function(){if(document.hidden)stopPolling();else activate()});
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
