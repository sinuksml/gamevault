# GameVault BiglyBT gateway

Deploy `worker.js` as a Cloudflare Worker. Configure these as encrypted Worker secrets:

- `UPSTREAM_URL`: the HTTP BiglyBT address using a Cloudflare-supported external port, for example `http://your-ddns-name:8080/`.
- `COOKIE_SECRET`: a long random value of at least 32 characters.

Configure the router with external TCP port `8080` forwarding to the Shield's port `9093`. Do not put the public IP, username, password, or cookie secret in this repository.

After deployment, paste the resulting `https://...workers.dev` URL into GameVault Settings under BiglyBT. The first embedded visit asks for the BiglyBT username and password; the gateway stores them in an encrypted, HttpOnly cookie.
