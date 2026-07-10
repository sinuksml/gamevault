# GameVault BiglyBT gateway

Deploy `worker.js` as a Cloudflare Worker. Configure this as an encrypted Worker secret:

- `UPSTREAM_URL`: the HTTP BiglyBT address using a Cloudflare-supported external port, for example `http://your-ddns-name:8080/`.

Configure the router with external TCP port `8080` forwarding to the Shield's port `9093`. Do not put the public IP, username, password, or cookie secret in this repository.

After deployment, paste the resulting `https://...workers.dev` URL into GameVault Settings under BiglyBT. The browser displays its native Basic Authentication prompt and can remember the BiglyBT login using the browser/password manager.
