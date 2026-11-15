/**
 * Builds shared/fixtures/merge-cases.json: pairs of vaults and what the website's
 * core.js merges them into, in both directions.
 *
 * core.js is the reference every client must agree with. The Android TV app's
 * merge (VaultMerge.java) and the rebuilt site's (web/src/lib/syncMerge.ts) are
 * both tested against this file, so a change to the merge has to update all three
 * on purpose. Regenerate with:   node shared/fixtures/merge-cases.mjs
 * The web tests fail if the committed file is out of date.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const sandbox = {};
vm.runInNewContext(readFileSync(resolve(here, "../../core.js"), "utf8"), {
  window: sandbox, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error("offline")),
});
const sync = sandbox.GameVaultCore.sync;

export const COLLECTIONS = [
  "rentals", "upcoming", "played", "dismissed", "catalogExtra", "vendors", "queue", "rentalHistory", "playing", "upcomingRemoved",
  "watchedMovies", "movieWatchlist", "watchingMovies", "hiddenMovies", "watchedSeries", "seriesWatchlist", "watchingSeries", "hiddenSeries",
  "biglyHistory", "subscriptions", "subscriptionGames", "purchasedGames", "petrol", "hiddenGames", "deletions",
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const game = (id, name, extra = {}) => ({ id, name, canonicalId: `game:title:${name.toLowerCase().replace(/\W/g, "")}|`, ...extra });
const movie = (id, title, extra = {}) => ({ id, title, key: `tmdb:${id}`, canonicalId: `tmdb:movie:${id}`, ...extra });

function base() {
  return {
    version: 15, updatedAt: 1000, revision: 4,
    queue: [game("a", "Alpha"), game("b", "Beta")],
    played: [game("c", "Gamma", { cost: 300 })],
    movieWatchlist: [movie(1, "One"), movie(2, "Two")],
    hiddenGames: [{ name: "Hidden on desktop" }],
    finance: { cipher: "opaque" }, futureField: { keep: true },
  };
}

/** An edit the way a client records it: change the vault, then stamp what changed. */
function edit(vault, at, change) {
  const before = sync.snapshot(vault, COLLECTIONS);
  change(vault);
  sync.track(vault, before, COLLECTIONS, at);
  vault.updatedAt = at;
  vault.revision = (vault.revision || 0) + 1;
  return vault;
}

const cases = {
  "edits on both sides to different lists": () => [
    edit(base(), 2000, (v) => v.queue.push(game("d", "Delta"))),
    edit(base(), 3000, (v) => v.movieWatchlist.unshift(movie(3, "Three"))),
  ],
  "the same record edited on both sides": () => [
    edit(base(), 2000, (v) => { v.played[0].note = "local"; }),
    edit(base(), 3000, (v) => { v.played[0].note = "remote"; }),
  ],
  "a deletion against an older edit": () => [
    edit(base(), 3000, (v) => { v.queue = v.queue.filter((item) => item.id !== "a"); }),
    edit(base(), 2000, (v) => { v.queue[0].note = "edited before the delete"; }),
  ],
  "a deletion against a newer edit": () => [
    edit(base(), 2000, (v) => { v.queue = v.queue.filter((item) => item.id !== "a"); }),
    edit(base(), 3000, (v) => { v.queue[0].note = "edited after the delete"; }),
  ],
  "a title moved between lists on one side": () => [
    edit(base(), 3000, (v) => { const [moved] = v.queue.splice(0, 1); v.playing = [{ ...moved, status: "Playing" }]; }),
    base(),
  ],
  "the same move merged from the other side": () => [
    base(),
    edit(base(), 3000, (v) => { const [moved] = v.queue.splice(0, 1); v.playing = [{ ...moved, status: "Playing" }]; }),
  ],
  "a desktop deletion marker": () => {
    const remote = base();
    remote.movieWatchlist = remote.movieWatchlist.filter((item) => item.id !== 2);
    remote.deletions = [{ collection: "movieWatchlist", identity: "canonicalId:tmdb:movie:2", at: 2500 }];
    remote.updatedAt = 2500;
    return [edit(base(), 2000, (v) => v.queue.push(game("d", "Delta"))), remote];
  },
  "a re-add after a desktop deletion": () => {
    const remote = base();
    remote.deletions = [{ collection: "queue", identity: "id:a", at: 1500 }];
    remote.queue = remote.queue.filter((item) => item.id !== "a");
    remote.updatedAt = 1500;
    return [edit(base(), 2600, (v) => { v.queue[0].note = "added again"; }), remote];
  },
  "a list only the other client knows": () => [
    edit(base(), 2000, (v) => { v.hiddenGames.push({ name: "Another" }); }),
    edit(base(), 3000, (v) => { v.desktopOnly = [{ id: "x", name: "From desktop" }]; }),
  ],
  "an empty local vault against a full remote": () => [{ updatedAt: 0, version: 15 }, base()],
  "records with no identifier at all": () => [
    edit(base(), 2000, (v) => { v.petrol = [{ date: "2026-10-01" }]; }),
    edit(base(), 3000, (v) => { v.petrol = [{ date: "2026-11-01" }]; }),
  ],
  // Known behaviour, pinned on purpose: every rental of one game shares a record key,
  // so repeated rentals collapse to one history entry. See docs/android-tv-2026-review.md.
  "repeated rentals of one game": () => {
    const first = game("r1", "Alpha", { start: "2026-08-01", end: "2026-08-30" });
    const second = game("r2", "Alpha", { start: "2026-11-01", end: "2026-11-20" });
    return [edit({ ...base(), rentalHistory: [] }, 2000, (v) => { v.rentalHistory = [first, second]; }), edit({ ...base(), rentalHistory: [] }, 3000, (v) => { v.rentalHistory = [first]; })];
  },
};

export function build() {
  return Object.entries(cases).map(([name, make]) => {
    const [local, remote] = make();
    return {
      name, local: clone(local), remote: clone(remote),
      merged: clone(sync.merge(clone(local), clone(remote), COLLECTIONS)),
      mergedFromRemote: clone(sync.merge(clone(remote), clone(local), COLLECTIONS)),
    };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(here, "merge-cases.json");
  writeFileSync(out, JSON.stringify({ collections: COLLECTIONS, cases: build() }, null, 1) + "\n");
  console.log(`wrote ${out}`);
}
