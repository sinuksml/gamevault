import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_COOKIE = "gvbt_session";
const WORKER_VERSION = "github-v4";
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

function frameHeaders(extra) {
  return Object.assign({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "frame-ancestors https://sinuksml.github.io",
    "X-GameVault-Worker-Version": WORKER_VERSION
  }, extra || {});
}

function htmlPage(message, isError) {
  const notice = message
    ? `<p class="notice ${isError ? "error" : ""}">${escapeHtml(message)}</p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BiglyBT Login</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#090d14;color:#eef4ff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.box{width:min(460px,100%);padding:24px;border:1px solid #2b4770;border-radius:14px;background:#111927;box-shadow:0 18px 50px #0008}h1{margin:0 0 7px;font-size:25px}p{color:#9eabc0;line-height:1.5;margin:0 0 16px}.notice{padding:10px 12px;border:1px solid #315b8f;border-radius:9px;background:#132943;color:#dbeaff}.notice.error{border-color:#9c3e48;background:#35181d;color:#ffb9c0}label{display:block;margin:12px 0 5px;font-size:12px;font-weight:700;color:#bdc9dc}input{width:100%;padding:12px;border:1px solid #30425e;border-radius:9px;background:#080d15;color:#fff;font:inherit;outline:none}input:focus{border-color:#4b9cff;box-shadow:0 0 0 3px #2878d52b}button{width:100%;margin-top:16px;padding:12px;border:1px solid #4b9cff;border-radius:9px;background:#1674df;color:#fff;font:700 15px inherit;cursor:pointer}.small{font-size:11px;margin:13px 0 0;text-align:center;color:#738198}
</style></head><body><main class="box"><h1>Sign in to BiglyBT</h1><p>Enter the same username and password that work on your BiglyBT Web Remote.</p>${notice}<form method="post" action="/__login"><label for="user">Username</label><input id="user" name="username" autocomplete="username" required autofocus><label for="pass">Password</label><input id="pass" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form><p class="small">Credentials are encrypted in a secure, device-specific browser session and are never stored in GameVault or GitHub.</p></main></body></html>`;
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

function loginResponse(message, isError, status) {
  return new Response(htmlPage(message, isError), {
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
        return loginResponse("Enter both the username and password.", true, 400);
      }

      let test;
      try {
        test = await upstreamFetch(request, env, credentials, "/");
      } catch (_) {
        return loginResponse("BiglyBT is offline or the upstream address cannot be reached.", true, 502);
      }
      if (test.status === 401) return loginResponse("Incorrect BiglyBT username or password.", true, 401);
      if (test.status === 403) return loginResponse("BiglyBT rejected the remote connection (403). Check its Web Remote access settings.", true, 403);
      if (test.status >= 500) return loginResponse(`BiglyBT returned server error ${test.status}.`, true, 502);

      const sealed = await sealSession(credentials, env.COOKIE_SECRET);
      return new Response(null, {
        status: 302,
        headers: frameHeaders({ "Location": "/", "Set-Cookie": sessionCookie(sealed, 2592000) })
      });
    }

    const sealed = cookieValue(request, SESSION_COOKIE);
    const credentials = sealed ? await openSession(sealed, env.COOKIE_SECRET) : null;
    if (!credentials) return loginResponse("", false, 200);

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
