/**
 * The shape of the library file and the rules for keeping it valid.
 *
 * The vault is one JSON object shared with the Windows and Android TV apps
 * (shared/game-vault.schema.json, schema 15). This site only reads the fields
 * it shows; everything else — finance, health, other clients' lists — is carried
 * through untouched so that saving here never erases data it does not own.
 */
import { stable, type Vault } from "./syncMerge";

export type { Vault };
export type Kind = "game" | "film" | "series";

export const SCHEMA_VERSION = 15;

export const ARRAY_FIELDS = [
  "rentals", "upcoming", "played", "dismissed", "catalogExtra", "vendors", "queue", "rentalHistory", "playing",
  "upcomingRemoved", "watchedMovies", "movieWatchlist", "watchingMovies", "hiddenMovies", "watchedSeries",
  "seriesWatchlist", "watchingSeries", "hiddenSeries", "biglyHistory", "subscriptions", "subscriptionGames",
  "purchasedGames", "petrol", "hiddenGames", "deletions",
];
export const OBJECT_FIELDS = [
  "covers", "gamePlatforms", "dismissedNames", "fandom", "hubkeys", "keys", "seriesRatings", "aiChats", "health",
  "finance", "secureConfig", "_sync",
];
/** Lists merged record by record. Matches the previous site so both track the same changes. */
export const SYNC_COLLECTIONS = ARRAY_FIELDS.slice();

const GAME_LISTS = ["rentals", "upcoming", "played", "queue", "rentalHistory", "playing", "upcomingRemoved", "catalogExtra", "subscriptionGames", "purchasedGames"];
const FILM_LISTS = ["watchedMovies", "movieWatchlist", "watchingMovies", "hiddenMovies"];
const SERIES_LISTS = ["watchedSeries", "seriesWatchlist", "watchingSeries", "hiddenSeries"];

export function kindOf(collection: string): Kind {
  return FILM_LISTS.includes(collection) ? "film" : SERIES_LISTS.includes(collection) ? "series" : "game";
}

/** Lower-cased letters and digits only, for comparing titles. */
export function norm(value: unknown): string {
  const text = String(value || "").normalize("NFKD");
  return text.replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function canonicalId(item: any, kind: Kind): string {
  if (!item) return "";
  if (item.canonicalId) return item.canonicalId;
  if (kind === "film" || kind === "series") {
    const prefix = kind === "film" ? "movie" : "tv";
    if (item.tmdbId != null || item.id != null) return `tmdb:${prefix}:${item.tmdbId != null ? item.tmdbId : item.id}`;
    if (item.imdbId) return "imdb:" + item.imdbId;
    return `${kind === "film" ? "movie" : "series"}:title:${norm(item.title || item.name)}|${String(item.year || "")}`;
  }
  if (item.rawgId != null) return "rawg:" + item.rawgId;
  return `game:title:${norm(item.name || item.title)}|${String(item.year || "")}`;
}

function releases(item: any, kind: Kind): Record<string, unknown> {
  const out: Record<string, any> = { ...(item.releases && typeof item.releases === "object" ? item.releases : {}) };
  const provider = (item.providers || [])[0] || "";
  const source = item.releaseSource || "TMDB";
  if (kind === "film") {
    if (item.date && !out.theatrical) out.theatrical = { date: item.date, region: item.releaseRegion || "US", source };
    if (item.ottDate && !out.digital) out.digital = { date: item.ottDate, region: "IN", provider, source };
    if (item.blurayDate && !out.physical) out.physical = { date: item.blurayDate, region: "US", source };
  } else if (kind === "series") {
    if (item.date && !out.firstAir) out.firstAir = { date: item.date, region: item.releaseRegion || "", source };
    if (item.ottDate && !out.digital) out.digital = { date: item.ottDate, region: "IN", provider, source };
    if (item.latestDate && !out.latestEpisode) out.latestEpisode = { date: item.latestDate, source: "TMDB" };
    if (item.nextEpisode?.date && !out.nextEpisode) out.nextEpisode = { date: item.nextEpisode.date, source: "TMDB" };
  } else if (item.date && !out.launch) {
    out.launch = {
      date: item.date, platform: (item.platforms || []).join(" / ") || item.platform || "PS5",
      region: item.releaseRegion || "", source: item.src === "seed" ? "Curated" : item.releaseSource || "RAWG",
    };
  }
  return out;
}

/** Gives a record the identity and release block every client expects it to carry. */
export function normalizeRecord<T extends Record<string, any>>(item: T, kind: Kind): T {
  if (!item || typeof item !== "object") return item;
  (item as any).canonicalId = canonicalId(item, kind);
  (item as any).releases = releases(item, kind);
  return item;
}

export function normalizeLibrary(vault: Vault): void {
  for (const list of GAME_LISTS) for (const item of vault[list] || []) normalizeRecord(item, "game");
  for (const list of FILM_LISTS) for (const item of vault[list] || []) normalizeRecord(item, "film");
  for (const list of SERIES_LISTS) for (const item of vault[list] || []) normalizeRecord(item, "series");
}

/**
 * Makes any object safe to use as a vault: every known list is a list and every
 * known object an object. It never removes a field it does not recognise.
 */
export function migrate(input: unknown): Vault {
  const vault: Vault = input && typeof input === "object" && !Array.isArray(input) ? (input as Vault) : {};
  for (const key of ARRAY_FIELDS) if (!Array.isArray(vault[key])) vault[key] = [];
  for (const key of OBJECT_FIELDS) if (!vault[key] || typeof vault[key] !== "object" || Array.isArray(vault[key])) vault[key] = {};
  if (!("lastUpcomingSync" in vault)) vault.lastUpcomingSync = null;
  if (!("lastCatalogSync" in vault)) vault.lastCatalogSync = null;
  vault.version = Math.max(Number(vault.version) || 1, SCHEMA_VERSION);
  normalizeLibrary(vault);
  return vault;
}

export function validate(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["This is not a GameVault backup."];
  const vault = input as Vault;
  const errors: string[] = [];
  for (const key of ARRAY_FIELDS) if (key in vault && !Array.isArray(vault[key])) errors.push(`${key} must be a list.`);
  for (const key of OBJECT_FIELDS)
    if (key in vault && (!vault[key] || typeof vault[key] !== "object" || Array.isArray(vault[key]))) errors.push(`${key} must be an object.`);
  if (vault.updatedAt != null && !Number.isFinite(Number(vault.updatedAt))) errors.push("updatedAt is invalid.");
  if (!errors.length && !("played" in vault) && !("rentals" in vault) && !("queue" in vault) && !("movieWatchlist" in vault))
    errors.push("This file has no recognisable library lists.");
  return errors;
}

/**
 * How much real user data a vault holds. This is the guard against the worst
 * sync failure: an empty, freshly installed device overwriting a full backup.
 */
export function vaultSize(vault: Vault | null | undefined): number {
  if (!vault) return 0;
  const lists = ["played", "rentals", "rentalHistory", "queue", "playing", "movieWatchlist", "watchingMovies", "watchedMovies",
    "hiddenMovies", "seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries", "biglyHistory", "subscriptions",
    "subscriptionGames", "purchasedGames", "petrol"];
  let total = 0;
  for (const list of lists) total += (vault[list] || []).length;
  total += ((vault.health || {}).foodLog || []).length;
  if (vault.finance && vault.finance.cipher) total += 1;
  return total;
}

export function healthHasData(health: any): boolean {
  if (!health || typeof health !== "object") return false;
  return Boolean((health.foodLog || []).length || (health.labs || []).length || String(health.doctorNotes || "").trim());
}

export function sameVault(a: Vault, b: Vault): boolean {
  return stable(a) === stable(b);
}
