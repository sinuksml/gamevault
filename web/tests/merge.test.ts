/**
 * The new site must merge exactly like every other client. These tests load the
 * previous site's core.js unchanged and run both implementations over the same
 * inputs; any difference in output is a sync bug waiting to happen.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { clone, mergeVault, snapshot, stable, trackChanges } from "../src/lib/syncMerge";
import { SYNC_COLLECTIONS, migrate, validate, vaultSize } from "../src/lib/vault";

const root = resolve(__dirname, "../..");
const sandbox: any = {};
vm.runInNewContext(readFileSync(resolve(root, "core.js"), "utf8"), { window: sandbox, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error("offline")) });
const legacy = sandbox.GameVaultCore.sync;
const fixture = JSON.parse(readFileSync(resolve(root, "shared/fixtures/vault-v15.json"), "utf8"));

const game = (id: string, name: string, extra: object = {}) => ({ id, name, canonicalId: `game:title:${name.toLowerCase().replace(/\W/g, "")}|`, ...extra });
const movie = (id: number, title: string, extra: object = {}) => ({ id, title, key: `tmdb:${id}`, canonicalId: `tmdb:movie:${id}`, ...extra });

function base(): any {
  return {
    version: 15, updatedAt: 1000, revision: 4,
    queue: [game("a", "Alpha"), game("b", "Beta")],
    played: [game("c", "Gamma", { cost: 300 })],
    movieWatchlist: [movie(1, "One"), movie(2, "Two")],
    hiddenGames: [{ name: "Hidden on desktop" }],
    finance: { cipher: "opaque" }, futureField: { keep: true },
  };
}

/** Applies an edit the way a client does: change, then stamp what changed. */
function edit(vault: any, at: number, change: (vault: any) => void): any {
  const before = snapshot(vault, SYNC_COLLECTIONS);
  change(vault);
  trackChanges(vault, before, SYNC_COLLECTIONS, at);
  vault.updatedAt = at;
  vault.revision = (vault.revision || 0) + 1;
  return vault;
}

const scenarios: Record<string, () => [any, any]> = {
  "edits on both sides to different lists": () => [
    edit(base(), 2000, (v) => v.queue.push(game("d", "Delta"))),
    edit(base(), 3000, (v) => v.movieWatchlist.unshift(movie(3, "Three"))),
  ],
  "the same record edited on both sides": () => [
    edit(base(), 2000, (v) => { v.played[0].note = "local"; }),
    edit(base(), 3000, (v) => { v.played[0].note = "remote"; }),
  ],
  "a deletion against an older edit": () => [
    edit(base(), 3000, (v) => { v.queue = v.queue.filter((item: any) => item.id !== "a"); }),
    edit(base(), 2000, (v) => { v.queue[0].note = "edited before the delete"; }),
  ],
  "a deletion against a newer edit": () => [
    edit(base(), 2000, (v) => { v.queue = v.queue.filter((item: any) => item.id !== "a"); }),
    edit(base(), 3000, (v) => { v.queue[0].note = "edited after the delete"; }),
  ],
  "a desktop deletion marker": () => {
    const remote = base();
    remote.movieWatchlist = remote.movieWatchlist.filter((item: any) => item.id !== 2);
    remote.deletions = [{ collection: "movieWatchlist", identity: "canonicalId:tmdb:movie:2", at: 2500 }];
    remote.updatedAt = 2500;
    return [edit(base(), 2000, (v) => v.queue.push(game("d", "Delta"))), remote];
  },
  "a re-add after a desktop deletion": () => {
    const remote = base();
    remote.deletions = [{ collection: "queue", identity: "id:a", at: 1500 }];
    remote.queue = remote.queue.filter((item: any) => item.id !== "a");
    remote.updatedAt = 1500;
    return [edit(base(), 2600, (v) => { v.queue[0].note = "added again"; }), remote];
  },
  "a list only the other client knows": () => [
    edit(base(), 2000, (v) => { v.hiddenGames.push({ name: "Another" }); }),
    edit(base(), 3000, (v) => { v.desktopOnly = [{ id: "x", name: "From desktop" }]; }),
  ],
  "an empty local vault against a full remote": () => [migrate({ updatedAt: 0 }), base()],
  "the shared fixture against an edited copy": () => [clone(fixture), edit(clone(fixture), Date.now(), (v) => { (v.queue ||= []).push(game("zz", "Fixture addition")); })],
};

describe("merge parity with the previous site", () => {
  for (const [name, build] of Object.entries(scenarios)) {
    it(name, () => {
      const [local, remote] = build();
      expect(stable(mergeVault(clone(local), clone(remote), SYNC_COLLECTIONS))).toBe(stable(legacy.merge(clone(local), clone(remote), SYNC_COLLECTIONS)));
      // Merging is symmetric in what it keeps, whichever side runs it.
      expect(stable(mergeVault(clone(remote), clone(local), SYNC_COLLECTIONS))).toBe(stable(legacy.merge(clone(remote), clone(local), SYNC_COLLECTIONS)));
    });
  }

  it("tracks changes identically", () => {
    const ours = base();
    const theirs = base();
    const before = snapshot(ours, SYNC_COLLECTIONS);
    expect(stable(before)).toBe(stable(legacy.snapshot(theirs, SYNC_COLLECTIONS)));
    for (const vault of [ours, theirs]) { vault.queue.shift(); vault.played[0].cost = 450; vault.movieWatchlist.push(movie(9, "Nine")); }
    trackChanges(ours, before, SYNC_COLLECTIONS, 5000);
    legacy.track(theirs, legacy.snapshot(base(), SYNC_COLLECTIONS), SYNC_COLLECTIONS, 5000);
    expect(stable(ours._sync)).toBe(stable(theirs._sync));
  });
});

describe("what a merge must never lose", () => {
  it("keeps fields and lists this site does not know", () => {
    const [local, remote] = scenarios["a list only the other client knows"]();
    const merged = mergeVault(local, remote, SYNC_COLLECTIONS);
    expect(merged.finance).toEqual({ cipher: "opaque" });
    expect(merged.futureField).toEqual({ keep: true });
    expect(merged.desktopOnly).toHaveLength(1);
    expect(merged.hiddenGames).toHaveLength(2);
  });

  it("keeps both sides' additions", () => {
    const [local, remote] = scenarios["edits on both sides to different lists"]();
    const merged = mergeVault(local, remote, SYNC_COLLECTIONS);
    expect(merged.queue.map((item: any) => item.name)).toContain("Delta");
    expect(merged.movieWatchlist.map((item: any) => item.title)).toContain("Three");
  });

  it("honours a deletion made on the desktop", () => {
    const [local, remote] = scenarios["a desktop deletion marker"]();
    expect(mergeVault(local, remote, SYNC_COLLECTIONS).movieWatchlist.map((item: any) => item.id)).toEqual([1]);
  });
});

describe("vault handling", () => {
  it("migrating preserves every unknown field of the shared fixture", () => {
    const migrated = migrate(clone(fixture));
    for (const key of Object.keys(fixture)) expect(migrated).toHaveProperty(key);
    expect(migrated.futureClientField).toEqual(fixture.futureClientField);
    expect(validate(migrated)).toEqual([]);
  });

  it("treats a brand-new vault as empty and rejects non-vaults", () => {
    expect(vaultSize(migrate({}))).toBe(0);
    expect(validate([1, 2])).not.toEqual([]);
    expect(validate({ rentals: "nope" })).not.toEqual([]);
  });
});
