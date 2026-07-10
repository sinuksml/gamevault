function loginRequired(message) {
  return new Response(message || "Sign in to BiglyBT.", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "WWW-Authenticate": 'Basic realm="GameVault BiglyBT", charset="UTF-8"',
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    if (!env.UPSTREAM_URL) {
      return new Response("UPSTREAM_URL is not configured.", { status: 503 });
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization || !authorization.startsWith("Basic ")) {
      return loginRequired();
    }

    const incoming = new URL(request.url);
    const upstreamBase = new URL(env.UPSTREAM_URL);
    const target = new URL(incoming.pathname + incoming.search, upstreamBase);
    const headers = new Headers(request.headers);
    headers.set("Authorization", authorization);
    headers.set("Cache-Control", "no-store");
    headers.delete("Cookie");

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: /^(GET|HEAD)$/i.test(request.method) ? undefined : request.body,
      cache: "no-store",
      redirect: "manual"
    });

    if (response.status === 401 || response.status === 403) {
      return loginRequired("Incorrect BiglyBT username or password.");
    }

    const out = new Headers(response.headers);
    out.delete("X-Frame-Options");
    out.delete("Content-Security-Policy");
    out.set("Content-Security-Policy", "frame-ancestors https://sinuksml.github.io");
    out.set("Cache-Control", "no-store");
    const location = out.get("Location");
    if (location) out.set("Location", location.replace(upstreamBase.origin, incoming.origin));
    return new Response(response.body, { status: response.status, headers: out });
  }
};
