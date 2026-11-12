/**
 * Record-level merge of two vaults.
 *
 * This is a typed port of the sync section of the previous site's core.js, and
 * it must stay behaviourally identical to it: the Windows and Android TV apps
 * and any device still running the old site all merge the same Drive file, and
 * two clients that disagree about what a merge produces will fight forever.
 * tests/merge.test.ts runs both implementations over the same inputs.
 */

export type Vault = Record<string, any>;
type Times = Record<string, number>;
interface SyncState {
  version: number;
  records: Record<string, Times>;
  tombstones: Record<string, Times>;
}

export function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** JSON with sorted keys, so two equal records always produce the same text. */
export function stable(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + stable(record[key])).join(",") + "}";
}

function normalize(value: unknown): string {
  let text = String(value || "");
  try { text = text.normalize("NFKD").replace(/\p{M}/gu, ""); } catch { /* keep as is */ }
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

/** The key a record is tracked under inside one collection. */
export function recordKey(collection: string, item: any): string {
  if (item == null) return "";
  if (typeof item !== "object") return "value:" + normalize(item);
  if (item.canonicalId) return String(item.canonicalId);
  if (item.key) return String(item.key);
  if (item.tmdbId != null) return (collection.indexOf("series") >= 0 ? "tmdbtv:" : "tmdb:") + item.tmdbId;
  if (item.imdbId) return "imdb:" + item.imdbId;
  if (item.id != null) return "id:" + item.id;
  return "name:" + normalize(item.name || item.title || item.label || stable(item));
}

export function ensureSync(vault: Vault, collections: string[]): SyncState {
  if (!vault._sync || typeof vault._sync !== "object") vault._sync = { version: 1, records: {}, tombstones: {} };
  if (!vault._sync.records) vault._sync.records = {};
  if (!vault._sync.tombstones) vault._sync.tombstones = {};
  for (const collection of collections) {
    if (!vault._sync.records[collection]) vault._sync.records[collection] = {};
    if (!vault._sync.tombstones[collection]) vault._sync.tombstones[collection] = {};
  }
  return vault._sync;
}

export type Snapshot = Record<string, Record<string, string>>;

/** A signature of every record, used to see what changed between two saves. */
export function snapshot(vault: Vault, collections: string[]): Snapshot {
  const out: Snapshot = {};
  for (const collection of collections) {
    out[collection] = {};
    for (const item of vault[collection] || []) out[collection][recordKey(collection, item)] = stable(item);
  }
  return out;
}

/**
 * Stamps every record that changed since `previous` with the time of the change,
 * and leaves a tombstone for every record that disappeared.
 */
export function trackChanges(vault: Vault, previous: Snapshot | null, collections: string[], at?: number): Snapshot {
  const when = Number(at) || Date.now();
  const sync = ensureSync(vault, collections);
  for (const collection of collections) {
    const before = (previous && previous[collection]) || {};
    const current: Record<string, string> = {};
    for (const item of vault[collection] || []) {
      const key = recordKey(collection, item);
      if (!key) continue;
      const signature = stable(item);
      current[key] = signature;
      if (before[key] !== signature) sync.records[collection][key] = when;
      if (sync.tombstones[collection][key]) delete sync.tombstones[collection][key];
    }
    for (const key of Object.keys(before)) {
      if (key in current) continue;
      sync.tombstones[collection][key] = Math.max(when, Number(sync.tombstones[collection][key]) || 0);
      delete sync.records[collection][key];
    }
  }
  return snapshot(vault, collections);
}

export function mergeVault(localInput: Vault, remoteInput: Vault, knownCollections: string[]): Vault {
  const local = clone(localInput || {});
  const remote = clone(remoteInput || {});
  const localNewer = Number(local.updatedAt || 0) >= Number(remote.updatedAt || 0);
  const result: Vault = clone(localNewer ? local : remote);

  /* Reconcile every list either side has, not only the ones this client knows
     about. A list owned by another client would otherwise be copied wholesale
     from whichever vault was newer, dropping that client's changes. */
  let collections = knownCollections.slice();
  for (const side of [local, remote]) {
    for (const key of Object.keys(side)) {
      if (key.charAt(0) === "_" || key === "audit" || key === "deletions") continue;
      if (Array.isArray(side[key]) && collections.indexOf(key) < 0) collections.push(key);
    }
  }
  collections = collections.filter((name) => name !== "deletions");

  const ls = ensureSync(local, collections);
  const rs = ensureSync(remote, collections);
  result._sync = { version: 1, records: {}, tombstones: {} };

  for (const collection of collections) {
    const lm: Record<string, any> = {};
    const rm: Record<string, any> = {};
    const keys: Record<string, 1> = {};
    for (const item of local[collection] || []) { const key = recordKey(collection, item); if (key) { lm[key] = item; keys[key] = 1; } }
    for (const item of remote[collection] || []) { const key = recordKey(collection, item); if (key) { rm[key] = item; keys[key] = 1; } }
    for (const key of Object.keys(ls.tombstones[collection] || {})) keys[key] = 1;
    for (const key of Object.keys(rs.tombstones[collection] || {})) keys[key] = 1;

    const merged: any[] = [];
    const recordTimes: Times = {};
    const tombstones: Times = {};
    for (const key of Object.keys(keys)) {
      const lt = lm[key] ? Number((ls.records[collection] || {})[key]) || Number(local.updatedAt) || 0 : 0;
      const rt = rm[key] ? Number((rs.records[collection] || {})[key]) || Number(remote.updatedAt) || 0 : 0;
      const deletedAt = Math.max(Number((ls.tombstones[collection] || {})[key]) || 0, Number((rs.tombstones[collection] || {})[key]) || 0);
      const chosen = rt > lt ? rm[key] : lm[key] || rm[key];
      const chosenAt = Math.max(lt, rt);
      if (deletedAt >= chosenAt) { tombstones[key] = deletedAt; continue; }
      if (chosen) { merged.push(chosen); recordTimes[key] = chosenAt; }
    }
    result[collection] = merged;
    result._sync.records[collection] = recordTimes;
    result._sync.tombstones[collection] = tombstones;
  }

  applyDeletionMarkers(result, local, remote);
  result.updatedAt = Math.max(Number(local.updatedAt) || 0, Number(remote.updatedAt) || 0);
  result.revision = Math.max(Number(local.revision) || 0, Number(remote.revision) || 0);
  return result;
}

/* The Windows app records a deletion as { collection, identity, at } in
   "deletions", using the identity scheme below. Without honouring those, a title
   deleted on the desktop looks like a record this device still has and comes
   straight back on the next merge. */
const IDENTITY_KEYS = ["canonicalId", "rawgId", "tmdbId", "imdbId", "plexRatingKey", "key", "id"];

function letterOrDigit(value: unknown): string {
  try { return String(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); }
  catch { return String(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
}

function titleIdentity(item: any): string {
  const normalized = letterOrDigit(String(item.name || item.title || item.service || ""));
  if (!normalized) return "";
  let year = String(item.year || "");
  if (!year && item.date) { const parsed = new Date(item.date); if (!isNaN(parsed.getTime())) year = String(parsed.getFullYear()); }
  const discriminator = String(item.mediaType || item.platform || item.provider || "");
  return "title:" + normalized + ":" + year + ":" + discriminator.toLowerCase();
}

/** Every identity a record could be known by on another client. */
export function identityCandidates(item: any): string[] {
  const out: string[] = [];
  if (!item || typeof item !== "object") return out;
  for (const key of IDENTITY_KEYS) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).length) out.push(key + ":" + String(value));
  }
  const title = titleIdentity(item);
  if (title) out.push(title);
  return out;
}

/** The identity the Windows app would write for this record when it deletes it. */
export function deletionIdentity(item: any): string {
  return identityCandidates(item)[0] || "";
}

function applyDeletionMarkers(result: Vault, local: Vault, remote: Vault): void {
  // Keep one marker per collection and identity, the newest, as the desktop does.
  const newest: Record<string, any> = {};
  for (const marker of ([] as any[]).concat(local.deletions || [], remote.deletions || [])) {
    if (!marker || !marker.collection || !marker.identity) continue;
    const key = marker.collection + " " + marker.identity;
    if (!newest[key] || Number(marker.at || 0) > Number(newest[key].at || 0)) newest[key] = marker;
  }
  const markers = Object.keys(newest).map((key) => newest[key]);
  result.deletions = markers.slice().sort((a, b) => Number(b.at || 0) - Number(a.at || 0));

  const byCollection: Record<string, Times> = {};
  for (const marker of markers)
    (byCollection[marker.collection] = byCollection[marker.collection] || {})[String(marker.identity).toLowerCase()] = Number(marker.at || 0);

  for (const collection of Object.keys(byCollection)) {
    if (!Array.isArray(result[collection])) continue;
    const deleted = byCollection[collection];
    const times: Times = (result._sync && result._sync.records && result._sync.records[collection]) || {};
    result[collection] = result[collection].filter((item: any) => {
      let hit = 0;
      for (const candidate of identityCandidates(item)) {
        const at = deleted[candidate.toLowerCase()];
        if (at && at > hit) hit = at;
      }
      if (!hit) return true;
      // A record saved again after the deletion is a genuine re-add; keep it.
      return Number(times[recordKey(collection, item)] || 0) > hit;
    });
  }
}
