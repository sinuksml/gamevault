/**
 * The vault held in memory, and the only way to change it.
 *
 * Storage is deliberately the same as the previous site's: the same
 * localStorage key and the same IndexedDB record. Both sites are served from
 * one origin, so a library opened here is the library the old site had, and
 * either can be used while the other still exists.
 */
import { useSyncExternalStore } from "react";
import { clone, snapshot, trackChanges, type Snapshot } from "./syncMerge";
import { SYNC_COLLECTIONS, migrate, normalizeLibrary, validate, vaultSize, type Vault } from "./vault";

const STORE_KEY = "ps5-tracker-v1";
const RECOVERY_KEY = "gamevault-recovery-v1";
const DEVICE_KEY = "gamevault-device-id";
const MAX_SNAPSHOTS = 8;
const SIX_HOURS = 6 * 60 * 60 * 1000;

// ---- Small key/value settings (API keys, theme, tokens) --------------------

export const settings = {
  get(key: string, fallback = ""): string {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: string): void {
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* private mode */ }
    notify();
  },
};

export function deviceId(): string {
  let id = settings.get(DEVICE_KEY);
  if (!id) {
    id = `device-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    try { localStorage.setItem(DEVICE_KEY, id); } catch { return "unknown-device"; }
  }
  return id;
}

// ---- IndexedDB, in the previous site's layout ------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("sinu-game-vault", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("records")) request.result.createObjectStore("records", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => { dbPromise = null; throw error; });
  return dbPromise;
}

export const idb = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await openDb();
      return await new Promise<T | null>((resolve, reject) => {
        const request = db.transaction("records", "readonly").objectStore("records").get(key);
        request.onsuccess = () => resolve(request.result ? (request.result.value as T) : null);
        request.onerror = () => reject(request.error);
      });
    } catch { return null; }
  },
  async put(key: string, value: unknown): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("records", "readwrite");
        tx.objectStore("records").put({ key, value, savedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } catch { /* storage unavailable: localStorage still has the vault */ }
  },
};

// ---- State ------------------------------------------------------------------

let data: Vault = load();
let shadow: Snapshot = snapshot(data, SYNC_COLLECTIONS);
let version = 0;
let storageFull = false;
const listeners = new Set<() => void>();
const saveListeners = new Set<() => void>();

function load(): Vault {
  let stored: unknown = null;
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) stored = JSON.parse(raw); } catch { /* unreadable: start empty */ }
  const vault = migrate(stored ?? {});
  // A new or wiped device must never look newer than the cloud copy.
  if (!stored) vault.updatedAt = 0;
  return vault;
}

function notify(): void {
  version++;
  for (const listener of listeners) listener();
}

function write(): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); storageFull = false; }
  catch { storageFull = true; }
  void idb.put("vault", data);
}

/**
 * localStorage holds about 5 MB. A larger library lives only in IndexedDB, so
 * on start-up the IndexedDB copy wins when it is the newer of the two.
 */
export async function hydrate(): Promise<void> {
  const stored = await idb.get<Vault>("vault");
  if (!stored || typeof stored !== "object") return;
  if (Number(stored.updatedAt || 0) <= Number(data.updatedAt || 0) && vaultSize(data) > 0) return;
  if (vaultSize(stored) === 0) return;
  data = migrate(stored);
  shadow = snapshot(data, SYNC_COLLECTIONS);
  notify();
}

export const vault = {
  /** The live vault. Treat it as read-only outside `change` and `changeSilently`. */
  get data(): Vault { return data; },
  get storageFull(): boolean { return storageFull; },

  /**
   * Applies a user edit: stamps what changed, bumps the revision, saves, and
   * tells sync there is something to upload.
   */
  change(edit: (vault: Vault) => void): void {
    edit(data);
    const now = Date.now();
    normalizeLibrary(data);
    shadow = trackChanges(data, shadow, SYNC_COLLECTIONS, now);
    data.updatedAt = now;
    data.revision = (Number(data.revision) || 0) + 1;
    data.lastDevice = deviceId();
    const latest = recovery.list()[0];
    if (vaultSize(data) && (!latest || now - latest.createdAt > SIX_HOURS)) recovery.create("Automatic checkpoint");
    write();
    notify();
    for (const listener of saveListeners) listener();
  },

  /**
   * Saves derived data (artwork, fetched ratings, catalog caches) without
   * bumping updatedAt, so an idle device filling in covers can never
   * out-timestamp a real edit made elsewhere and roll it back through sync.
   */
  changeSilently(edit: (vault: Vault) => void): void {
    edit(data);
    normalizeLibrary(data);
    write();
    notify();
  },

  /** Replaces the whole vault (a restore, an import, or a merge result), keeping a recovery point first. */
  adopt(incoming: Vault, reason: string): void {
    const errors = validate(incoming);
    if (errors.length) throw new Error(errors.join(" "));
    if (vaultSize(data)) recovery.create(`Before ${reason}`);
    data = migrate(clone(incoming));
    shadow = snapshot(data, SYNC_COLLECTIONS);
    write();
    notify();
  },

  /** Runs after every user edit, for sync to schedule an upload. */
  onSaved(listener: () => void): () => void {
    saveListeners.add(listener);
    return () => saveListeners.delete(listener);
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the calling component whenever the vault or a setting changes. */
export function useVault(): Vault {
  useSyncExternalStore(subscribe, () => version);
  return data;
}

// ---- Recovery points --------------------------------------------------------

export interface RecoveryPoint { createdAt: number; reason: string; size: number; raw: string }

export const recovery = {
  list(): RecoveryPoint[] {
    try { const list = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "[]"); return Array.isArray(list) ? list : []; }
    catch { return []; }
  },
  create(reason: string): boolean {
    if (!vaultSize(data)) return false;
    try {
      let list = recovery.list();
      const raw = JSON.stringify(data);
      if (list[0]?.raw === raw) return true;
      if (raw.length > 1_800_000) return false;   // would not fit beside the vault itself
      list.unshift({ createdAt: Date.now(), reason, size: vaultSize(data), raw });
      list = list.slice(0, MAX_SNAPSHOTS);
      while (list.length > 1 && JSON.stringify(list).length > 2_000_000) list.pop();
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(list));
      return true;
    } catch { return false; }
  },
  restore(point: RecoveryPoint): void {
    vault.adopt(JSON.parse(point.raw), "recovery restore");
    // Restoring is a deliberate edit, so it must win the next sync.
    vault.change(() => {});
  },
};

// ---- Undo -------------------------------------------------------------------

let undoState: { lists: Record<string, any[]> } | null = null;

/** Remembers the lists an action is about to touch so it can be reversed. */
export function captureUndo(lists: string[]): void {
  undoState = { lists: Object.fromEntries(lists.map((name) => [name, clone(data[name] || [])])) };
}

export function undo(): boolean {
  if (!undoState) return false;
  const { lists } = undoState;
  undoState = null;
  vault.change((current) => { for (const name of Object.keys(lists)) current[name] = lists[name]; });
  return true;
}

// ---- Toasts -----------------------------------------------------------------

export interface Toast { id: number; message: string; tone: "info" | "success" | "error"; undo: boolean }
let toasts: Toast[] = [];
let toastId = 0;
const toastListeners = new Set<() => void>();

export function toast(message: string, tone: Toast["tone"] = "info", options: { undo?: boolean } = {}): void {
  const entry: Toast = { id: ++toastId, message, tone, undo: Boolean(options.undo) };
  toasts = [...toasts.slice(-2), entry];
  for (const listener of toastListeners) listener();
  if (tone !== "error") setTimeout(() => dismissToast(entry.id), options.undo ? 8000 : 4500);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((entry) => entry.id !== id);
  for (const listener of toastListeners) listener();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore((listener) => { toastListeners.add(listener); return () => toastListeners.delete(listener); }, () => toasts);
}
