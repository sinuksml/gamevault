/**
 * Google Drive sync.
 *
 * The whole library is one file, game-vault-backup.json, shared with the
 * Windows and Android TV apps. The rules that keep three clients from
 * destroying each other's work:
 *
 *  1. Download and merge the Drive copy before every upload.
 *  2. Never replace a populated Drive copy with an empty local one.
 *  3. Merge record by record (syncMerge), never whole-file newest-wins.
 *  4. Carry through what this site does not own: the TV catalog snapshot and
 *     any field it has never heard of.
 *  5. Uploads are serialised; edits are debounced, not uploaded one by one.
 */
import { useSyncExternalStore } from "react";
import { clone, mergeVault, stable } from "./syncMerge";
import { deviceId, idb, settings, toast, vault } from "./store";
import { SYNC_COLLECTIONS, healthHasData, migrate, vaultSize, type Vault } from "./vault";

const FILE_NAME = "game-vault-backup.json";
const HISTORY_PREFIX = "game-vault-history-";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
/* Public by design: a browser OAuth client is protected by its list of
   authorised origins, not by secrecy. A value saved in Settings overrides it. */
const DEFAULT_CLIENT_ID = "898110284062-76km1uptkth506kgaecoafohu15js0rh.apps.googleusercontent.com";

const CLIENT_KEY = "ps5-gd-client";
const TOKEN_KEY = "ps5-gd-token";
const HISTORY_KEY = "ps5-gd-history-at";
const HEALTH_SYNC_KEY = "gamevault-sync-health-v1";

export type SyncPhase = "local" | "idle" | "pending" | "syncing" | "synced" | "error";
export interface SyncStatus { phase: SyncPhase; message: string; at: number }

let status: SyncStatus = { phase: "local", message: "Saved on this device", at: 0 };
const listeners = new Set<() => void>();

function setStatus(phase: SyncPhase, message: string): void {
  status = { phase, message, at: Date.now() };
  for (const listener of listeners) listener();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => status);
}

// ---- Sign-in ----------------------------------------------------------------

interface StoredToken { access_token: string; exp: number }

export const clientId = () => settings.get(CLIENT_KEY) || DEFAULT_CLIENT_ID;
export const setClientId = (value: string) => settings.set(CLIENT_KEY, value.trim());
export const usesDefaultClient = () => !settings.get(CLIENT_KEY);

function storedToken(): StoredToken | null {
  try { return JSON.parse(settings.get(TOKEN_KEY) || "null"); } catch { return null; }
}

export const isConnected = () => Boolean(storedToken());

declare const google: any;
let scriptPromise: Promise<void> | null = null;

function loadGoogle(): Promise<void> {
  if (typeof google !== "undefined" && google.accounts?.oauth2) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = null; reject(new Error("Google sign-in was blocked by the browser or the network.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

let tokenClient: any = null;
let tokenClientFor = "";

/**
 * A valid access token. Tokens last about an hour; renewing one opens Google's
 * prompt, which browsers only allow from a click, so `interactive` is true only
 * when the user asked for a sync.
 */
async function accessToken(interactive: boolean): Promise<string> {
  const token = storedToken();
  if (token?.access_token && Date.now() < (token.exp || 0) - 60_000) return token.access_token;
  if (!interactive) throw new Error(token ? "The Google session needs renewing. Select Sync to continue." : "Not signed in.");
  await loadGoogle();
  if (!tokenClient || tokenClientFor !== clientId()) {
    tokenClientFor = clientId();
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: tokenClientFor, scope: SCOPE, callback: () => {} });
  }
  return new Promise<string>((resolve, reject) => {
    tokenClient.callback = (response: any) => {
      if (!response?.access_token) { reject(new Error(response?.error_description || response?.error || "Sign-in failed.")); return; }
      settings.set(TOKEN_KEY, JSON.stringify({ access_token: response.access_token, exp: Date.now() + (Number(response.expires_in) || 3600) * 1000 }));
      resolve(response.access_token);
    };
    tokenClient.error_callback = (error: any) => reject(new Error(error?.type === "popup_closed" ? "Sign-in was cancelled." : error?.message || "Sign-in failed."));
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function api(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000) });
  if (response.status === 401) {
    settings.set(TOKEN_KEY, "");
    throw new Error("The Google session expired. Sign in again.");
  }
  if (!response.ok) throw new Error(`Google Drive returned ${response.status}.`);
  return response;
}

// ---- The Drive file ---------------------------------------------------------

/**
 * Finds the backup file. Always lists rather than trusting a remembered id: if
 * two devices ever raced and each created a file, every device converges on the
 * newest one and the older duplicates go to the trash.
 */
async function findFile(token: string): Promise<string> {
  const query = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const listing = await (await api(`${API}?q=${query}&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10`, token)).json();
  const files: { id: string }[] = listing.files || [];
  for (const duplicate of files.slice(1))
    void api(`${API}/${duplicate.id}`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"trashed":true}' }).catch(() => {});
  return files[0]?.id || "";
}

function multipart(metadata: object, body: string): { body: string; type: string } {
  const boundary = "gv" + Date.now();
  return {
    type: `multipart/related; boundary=${boundary}`,
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
  };
}

const healthSyncs = () => settings.get(HEALTH_SYNC_KEY) === "1";

/** The Android TV app reads its catalog from the Drive file; this site only passes it along. */
let tvCatalog: unknown = null;

/** A downloaded Drive copy, reduced to the part that takes part in the merge. */
function fromCloud(remote: Vault): Vault {
  const copy = clone(remote);
  if (copy.nativeTvCatalog) { tvCatalog = copy.nativeTvCatalog; void idb.put("native-tv-catalog", tvCatalog); }
  delete copy.nativeTvCatalog;
  delete copy.cloudPrivacy;
  return migrate(copy);
}

/** What is uploaded: the vault without device secrets, and without health unless the user opted in. */
function forCloud(): string {
  const copy = clone(vault.data);
  delete copy.keys;
  delete copy.trustedDeviceConfig;
  if (!healthSyncs()) delete copy.health;
  if (tvCatalog) copy.nativeTvCatalog = tvCatalog;
  copy.cloudPrivacy = { apiKeysExcluded: true, encryptedCredentials: Boolean(copy.secureConfig?.cipher), healthIncluded: healthSyncs() };
  return JSON.stringify(copy);
}

/**
 * Folds a Drive copy into the local vault.
 * @returns whether the local vault changed, and whether Drive is now behind.
 */
function mergeRemote(remoteRaw: Vault, reason: string): { changedLocal: boolean; needsPush: boolean } {
  const remote = fromCloud(remoteRaw);
  const local = vault.data;
  const localSize = vaultSize(local);
  const remoteSize = vaultSize(remote);
  if (remoteSize === 0 && localSize > 0) return { changedLocal: false, needsPush: true };

  const keepLocalHealth = !healthSyncs() && healthHasData(local.health) ? clone(local.health) : null;
  if (localSize === 0 && remoteSize > 0) {
    if (keepLocalHealth) remote.health = keepLocalHealth;
    vault.adopt(remote, reason);
    return { changedLocal: true, needsPush: false };
  }

  const merged = mergeVault(local, remote, SYNC_COLLECTIONS);
  if (keepLocalHealth) merged.health = keepLocalHealth;
  const mergedText = stable(merged);
  const changedLocal = mergedText !== stable(local);
  const needsPush = mergedText !== stable(remote);
  if (changedLocal) vault.adopt(merged, reason);
  return { changedLocal, needsPush };
}

async function download(token: string, fileId: string): Promise<Vault | null> {
  if (!fileId) return null;
  const remote = await (await api(`${API}/${fileId}?alt=media`, token)).json();
  // Anything that is not recognisably a vault is left alone rather than merged.
  return remote && typeof remote === "object" && Array.isArray(remote.rentals) && Array.isArray(remote.played) ? remote : null;
}

/** Keeps one dated copy per day in Drive, and only the five most recent. */
async function keepHistory(token: string, body: string): Promise<void> {
  const last = Number(settings.get(HISTORY_KEY)) || 0;
  if (!vaultSize(vault.data) || Date.now() - last < 86_400_000) return;
  try {
    const day = new Date().toLocaleDateString("en-CA");
    const part = multipart({ name: `${HISTORY_PREFIX}${day}.json`, mimeType: "application/json", appProperties: { gameVaultHistory: "true" } }, body);
    await api(`${UPLOAD}?uploadType=multipart&fields=id`, token, { method: "POST", headers: { "Content-Type": part.type }, body: part.body });
    settings.set(HISTORY_KEY, String(Date.now()));
    const query = encodeURIComponent("appProperties has { key='gameVaultHistory' and value='true' } and trashed=false");
    const listing = await (await api(`${API}?q=${query}&fields=files(id,createdTime)&orderBy=createdTime%20desc&pageSize=20`, token)).json();
    await Promise.all((listing.files || []).slice(5).map((file: { id: string }) => api(`${API}/${file.id}`, token, { method: "DELETE" }).catch(() => {})));
  } catch { /* history is a convenience; the main backup already succeeded */ }
}

// ---- Orchestration ----------------------------------------------------------

let queue: Promise<unknown> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | undefined;
let cloudChecked = false;
let lastSyncedAt = 0;

/**
 * One full sync: download, merge, and upload if Drive is behind.
 * Runs are queued, so two can never interleave.
 */
export function syncNow(options: { interactive?: boolean; quiet?: boolean } = {}): Promise<void> {
  const run = async () => {
    if (!isConnected() && !options.interactive) return;
    clearTimeout(timer);
    setStatus("syncing", "Syncing with Google Drive…");
    try {
      const token = await accessToken(Boolean(options.interactive));
      tvCatalog ??= await idb.get("native-tv-catalog");
      const fileId = await findFile(token);
      const remote = await download(token, fileId);
      cloudChecked = true;

      let needsPush = !remote;
      let changedLocal = false;
      if (remote) {
        // A file last written by this device and unchanged since needs no merge.
        const untouched = remote.lastDevice === deviceId() && Number(remote.updatedAt) === Number(vault.data.updatedAt);
        if (untouched) fromCloud(remote);
        else ({ changedLocal, needsPush } = mergeRemote(remote, "Google Drive merge"));
      }
      // Never seed Drive from an empty library.
      if (needsPush && vaultSize(vault.data) === 0) needsPush = false;

      if (needsPush) {
        const body = forCloud();
        if (fileId) await api(`${UPLOAD}/${fileId}?uploadType=media`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
        else {
          const part = multipart({ name: FILE_NAME, mimeType: "application/json" }, body);
          await api(`${UPLOAD}?uploadType=multipart&fields=id`, token, { method: "POST", headers: { "Content-Type": part.type }, body: part.body });
        }
        await keepHistory(token, body);
      }
      lastSyncedAt = Number(vault.data.updatedAt) || 0;
      setStatus("synced", changedLocal ? "Updated from Google Drive" : "Synced with Google Drive");
      if (changedLocal && !options.quiet) toast("Your library was updated from Google Drive.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      setStatus(isConnected() ? "error" : "local", isConnected() ? message : "Saved on this device");
      if (!options.quiet) toast(`Google Drive sync failed. ${message}`, "error");
    }
  };
  queue = queue.then(run, run);
  return queue as Promise<void>;
}

/** Called after every edit: waits for editing to settle, then syncs once. */
function schedule(): void {
  if (!isConnected()) { setStatus("local", "Saved on this device"); return; }
  setStatus("pending", "Saved · sync pending");
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow({ quiet: true }), 2500);
}

export async function signIn(): Promise<void> {
  await accessToken(true);
  await syncNow({ interactive: true });
}

export function signOut(): void {
  const token = storedToken();
  try { if (token && typeof google !== "undefined") google.accounts.oauth2.revoke(token.access_token, () => {}); } catch { /* already invalid */ }
  settings.set(TOKEN_KEY, "");
  cloudChecked = false;
  setStatus("local", "Saved on this device");
}

/** Wires sync to the vault. Call once at start-up. */
export function startSync(): void {
  vault.onSaved(schedule);
  if (isConnected()) {
    setStatus("idle", "Google Drive connected");
    void syncNow({ quiet: true });
  }
  // While the tab is open and idle, look for changes made on another device.
  setInterval(() => {
    if (document.visibilityState !== "visible" || !isConnected()) return;
    if (Number(vault.data.updatedAt || 0) > lastSyncedAt && cloudChecked) return;   // an upload is already pending
    void syncNow({ quiet: true });
  }, 120_000);
  /* Renewing a token needs a user gesture, so piggyback on ordinary clicks
     shortly before the current one runs out. */
  let renewing = false;
  document.addEventListener("click", () => {
    const token = storedToken();
    if (renewing || !token || Date.now() < (token.exp || 0) - 10 * 60_000) return;
    renewing = true;
    accessToken(true).then(() => syncNow({ quiet: true }), () => {}).finally(() => { renewing = false; });
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isConnected() && Date.now() - status.at > 60_000) void syncNow({ quiet: true });
  });
}

export async function backupInfo(): Promise<{ bytes: number; files: number } | null> {
  try {
    const token = await accessToken(false);
    const query = encodeURIComponent(`(name='${FILE_NAME}' or name contains '${HISTORY_PREFIX}') and trashed=false`);
    const listing = await (await api(`${API}?q=${query}&fields=files(id,size)&pageSize=100`, token)).json();
    const files: { size?: string }[] = listing.files || [];
    return { files: files.length, bytes: files.reduce((total, file) => total + (Number(file.size) || 0), 0) };
  } catch { return null; }
}
