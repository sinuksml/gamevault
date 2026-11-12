import { Cloud, Database, Info, KeyRound, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { KEYS } from "../lib/catalog";
import { backupInfo, clientId, isConnected, setClientId, signIn, signOut, syncNow, useSyncStatus, usesDefaultClient } from "../lib/drive";
import { recovery, settings, toast, useVault, vault } from "../lib/store";
import { validate, vaultSize } from "../lib/vault";

function bytes(value: number): string {
  return value < 1024 ? `${value} B` : value < 1_048_576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1_048_576).toFixed(2)} MB`;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Appearance, sync, catalog keys, backups and what this version does not do yet. */
export function Settings() {
  const data = useVault();
  const sync = useSyncStatus();
  const connected = isConnected();
  const [theme, setTheme] = useState(settings.get("next-theme") || "system");
  const [client, setClient] = useState(usesDefaultClient() ? "" : clientId());
  const [keys, setKeys] = useState({ rawg: settings.get(KEYS.rawg), tmdb: settings.get(KEYS.tmdb), omdb: settings.get(KEYS.omdb) });
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<{ bytes: number; files: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const points = recovery.list();

  useEffect(() => { if (connected) void backupInfo().then(setBackup); else setBackup(null); }, [connected, sync.at]);

  const applyTheme = (value: string) => {
    setTheme(value);
    settings.set("next-theme", value === "system" ? "" : value);
    if (value === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = value;
  };

  const connect = async () => {
    setBusy(true);
    try { setClientId(client); await signIn(); }
    catch (error) { toast(error instanceof Error ? error.message : "Sign-in failed.", "error"); }
    finally { setBusy(false); }
  };

  const saveKeys = () => {
    settings.set(KEYS.rawg, keys.rawg.trim());
    settings.set(KEYS.tmdb, keys.tmdb.trim());
    settings.set(KEYS.omdb, keys.omdb.trim());
    toast("Catalog keys saved on this device.", "success");
  };

  const exportBackup = () => {
    const copy = structuredClone(data);
    delete copy.keys;   // device secrets never leave in a backup
    download(`game-vault-${new Date().toLocaleDateString("en-CA")}.json`, JSON.stringify(copy, null, 2));
  };

  const importBackup = async (chosen: File | undefined) => {
    if (!chosen) return;
    try {
      const incoming = JSON.parse(await chosen.text());
      const errors = validate(incoming);
      if (errors.length) throw new Error(errors.join(" "));
      if (!confirm(`Replace the whole library with ${chosen.name}?\n\nIt holds ${vaultSize(incoming)} items. The current library is kept as a recovery point first.`)) return;
      vault.adopt(incoming, "backup import");
      vault.change(() => {});   // an import is a deliberate edit, so it must win the next sync
      toast("Backup imported. The previous library is under Recovery points.", "success");
    } catch (error) { toast(`That file could not be imported. ${error instanceof Error ? error.message : ""}`, "error"); }
    finally { if (file.current) file.current.value = ""; }
  };

  return (
    <div className="page">
      <h1>Settings</h1>
      <div className="settings">
        <section className="card">
          <div className="setting-head"><Palette /><div><h2>Appearance</h2><p>Follow your device, or choose a theme for this browser.</p></div></div>
          <div className="segmented" role="group" aria-label="Theme">
            {[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([value, label]) => <button key={value} aria-pressed={theme === value} onClick={() => applyTheme(value)}>{label}</button>)}
          </div>
        </section>

        <section className="card">
          <div className="setting-head"><Cloud /><div><h2>Google Drive sync</h2>
            <p>The library is one file, game-vault-backup.json, in your own Drive. It is shared with the Windows and TV apps and merged record by record, so a change on one device never overwrites another.</p></div></div>
          <p style={{ marginBottom: 12 }}><span className={`chip ${connected ? (sync.phase === "error" ? "bad" : "good") : ""}`}>{connected ? sync.message : "Not connected"}</span>
            {backup && <span className="muted small" style={{ marginLeft: 10 }}>{bytes(backup.bytes)} in Drive across {backup.files} {backup.files === 1 ? "file" : "files"}</span>}</p>
          <label className="field" style={{ marginBottom: 12 }}>Google OAuth Client ID (optional)
            <input value={client} onChange={(event) => setClient(event.target.value)} placeholder="Leave empty to use the built-in client" autoComplete="off" spellCheck={false} /></label>
          <div className="inline">
            {!connected && <button className="btn primary" onClick={connect} disabled={busy}>{busy ? "Waiting for Google…" : "Sign in with Google"}</button>}
            {connected && <button className="btn primary" onClick={() => void syncNow({ interactive: true })} disabled={sync.phase === "syncing"}>Sync now</button>}
            {connected && <button className="btn" onClick={() => { signOut(); toast("Google Drive disconnected. The library stays on this device."); }}>Disconnect</button>}
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>Sign-in only works on addresses listed as authorised origins for the OAuth client, such as sinuksml.github.io. It will not work on localhost unless you add it in Google Cloud Console.</p>
        </section>

        <section className="card">
          <div className="setting-head"><KeyRound /><div><h2>Catalog keys</h2><p>RAWG powers game search and discovery, TMDB movies and TV, OMDb adds IMDb ratings. Keys are free, stay in this browser, and are never uploaded.</p></div></div>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="field">RAWG<input type="password" value={keys.rawg} onChange={(event) => setKeys({ ...keys, rawg: event.target.value })} autoComplete="off" /></label>
            <label className="field">TMDB (v3)<input type="password" value={keys.tmdb} onChange={(event) => setKeys({ ...keys, tmdb: event.target.value })} autoComplete="off" /></label>
            <label className="field">OMDb<input type="password" value={keys.omdb} onChange={(event) => setKeys({ ...keys, omdb: event.target.value })} autoComplete="off" /></label>
          </div>
          <div className="inline"><button className="btn primary" onClick={saveKeys}>Save keys</button>
            <a className="btn ghost" href="https://rawg.io/apidocs" target="_blank" rel="noopener noreferrer">Get RAWG</a>
            <a className="btn ghost" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">Get TMDB</a>
            <a className="btn ghost" href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer">Get OMDb</a></div>
        </section>

        <section className="card">
          <div className="setting-head"><Database /><div><h2>Your data</h2><p>{vaultSize(data)} items in this library. Importing replaces the whole library; the current one is kept as a recovery point first.</p></div></div>
          <div className="inline" style={{ marginBottom: 14 }}>
            <button className="btn" onClick={exportBackup}>Export backup</button>
            <button className="btn" onClick={() => file.current?.click()}>Import backup…</button>
            <button className="btn" onClick={() => toast(recovery.create("Manual recovery point") ? "Recovery point created." : "A recovery point could not be created.", "success")}>Create recovery point</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(event) => void importBackup(event.target.files?.[0])} />
          </div>
          {vault.storageFull && <p className="small" style={{ color: "var(--bad)", marginBottom: 12 }}>This browser's quick storage is full. The library is still saved in its larger store, but export a backup now.</p>}
          <h3 style={{ marginBottom: 6 }}>Recovery points</h3>
          {points.length === 0 && <p className="muted small">None yet. One is taken automatically every six hours of use and before every import or merge.</p>}
          <div className="rows">
            {points.map((point) => (
              <div key={point.createdAt} className="row">
                <span><b>{new Date(point.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</b><span className="muted small">{point.reason} · {point.size} items</span></span>
                <button className="btn" onClick={() => { if (confirm(`Replace the library with the recovery point from ${new Date(point.createdAt).toLocaleString()}?`)) { recovery.restore(point); toast("Recovery point restored.", "success"); } }}>Restore</button>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="setting-head"><Info /><div><h2>About this version</h2><p>Sinu Game Vault web, version {__APP_VERSION__}. A rebuilt site that reads and writes the same library as the classic one.</p></div></div>
          <p className="muted small">Not rebuilt yet: Plex, BiglyBT downloads, Health, Finance, subscription plan editing, rental availability checks and release alerts. Their data is left untouched in your library and remains available in the classic site.</p>
          <div className="inline" style={{ marginTop: 12 }}><a className="btn" href="../">Open the classic site</a></div>
        </section>
      </div>
    </div>
  );
}
