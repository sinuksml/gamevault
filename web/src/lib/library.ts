/**
 * Turns stored records into titles the interface can show, and holds every
 * action that moves a title between lists. Nothing here touches the DOM.
 */
import { genreNames } from "./catalog";
import { recordKey } from "./syncMerge";
import { captureUndo, toast, vault } from "./store";
import { kindOf, norm, normalizeRecord, uid, type Kind, type Vault } from "./vault";

export type Section = "games" | "films" | "series";

export interface Title {
  /** Unique within the app: the list plus the record's sync key. */
  uid: string;
  list: string;
  kind: Kind;
  name: string;
  image: string;
  backdrop: string;
  /** ISO date most relevant to the list: return date, release date, renewal. */
  date: string;
  year: string;
  overview: string;
  genre: string;
  platforms: string;
  rating: number | null;
  ratingSource: string;
  status: string;
  note: string;
  cost: number;
  vendor: string;
  providers: string;
  /** Days until `date`; negative once it has passed; null when there is no date. */
  daysLeft: number | null;
  myRating: number;
  /** False for a discovery result that is not in the library yet. */
  stored: boolean;
  record: Record<string, any>;
}

// ---- Dates ------------------------------------------------------------------

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (/^\d{4}$/.test(text)) return null;
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export const todayIso = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };

export function daysUntil(value: unknown): number | null {
  const date = parseDate(value);
  if (!date) return null;
  const now = new Date();
  return Math.round((date.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
}

export function formatDate(value: unknown): string {
  const date = parseDate(value);
  if (!date) return /^\d{4}$/.test(String(value || "")) ? String(value) : "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const money = (amount: number) => "₹" + Math.round(amount).toLocaleString("en-IN");

function addDays(iso: string, days: number): string {
  const date = parseDate(iso) || new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** When a rental is due back: an explicit return date, or its start plus its length. */
export function rentalDue(record: any): string {
  if (record.returnDate) return String(record.returnDate);
  const days = Number(record.days) || 0;
  return record.start && days > 0 ? addDays(record.start, days) : "";
}

// ---- Records to titles ------------------------------------------------------

const LIST_LABELS: Record<string, string> = {
  rentals: "Rented", rentalHistory: "Returned", playing: "Playing", queue: "Rental queue", played: "Completed",
  purchasedGames: "Owned", subscriptionGames: "Subscription", upcoming: "Upcoming", catalogExtra: "Discover",
  movieWatchlist: "Watchlist", watchingMovies: "Watching", watchedMovies: "Watched", hiddenMovies: "Not interested",
  seriesWatchlist: "Watchlist", watchingSeries: "Watching", watchedSeries: "Watched", hiddenSeries: "Not interested",
};
export const listLabel = (list: string) => LIST_LABELS[list] || "Discover";

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) { const number = Number(value); if (value != null && value !== "" && number > 0) return number; }
  return null;
}

export function toTitle(record: Record<string, any>, list: string, kind: Kind = kindOf(list), stored = true): Title {
  const data = vault.data;
  const name = String(record.name || record.title || "Untitled");
  const game = kind === "game";
  const date = list === "rentals" ? rentalDue(record)
    : list === "rentalHistory" ? record.end || record.returnedAt || ""
    : list === "purchasedGames" ? record.purchaseDate || record.added || ""
    : record.date || record.releaseDate || record.firstAirDate || "";
  const imdb = firstNumber(record.imdb);
  const rating = game ? firstNumber(record.score ? record.score / 10 : null, record.rrating ? record.rrating * 2 : null, record.rating) : imdb ?? firstNumber(record.tmdb, record.rating);
  const platforms = Array.isArray(record.platforms) && record.platforms.length ? record.platforms.join(", ")
    : record.platform || (game ? (data.gamePlatforms?.[norm(name)] || []).join(", ") : (record.networks || []).join(", "));
  return {
    // The id is included because a game rented twice has two history records with one identity.
    uid: `${list}:${recordKey(list, record)}:${record.id ?? ""}`,
    list, kind, name, stored,
    image: record.img || record.poster || record.cover || (game ? data.covers?.[norm(name)] || "" : ""),
    backdrop: record.backdrop || "",
    date: String(date || ""),
    year: String(record.year || (parseDate(date)?.getFullYear() ?? "")),
    overview: String(record.overview || record.plot || ""),
    genre: genreNames(record),
    platforms: String(platforms || ""),
    rating,
    ratingSource: game ? (record.score ? "Metacritic" : "RAWG") : imdb ? "IMDb" : "TMDB",
    status: String(record.status || ""),
    note: String(record.note || ""),
    cost: Number(record.purchasePrice ?? record.cost) || 0,
    vendor: String(record.vendor || record.store || ""),
    providers: Array.isArray(record.providers) ? record.providers.join(", ") : String(record.provider || ""),
    daysLeft: list === "rentalHistory" || list === "played" || list.startsWith("watched") ? null : daysUntil(date),
    myRating: Math.max(0, Math.min(10, Math.round(Number(record.userRating ?? record.myRating) || 0))),
    record,
  };
}

export const titlesIn = (data: Vault, list: string): Title[] => (data[list] || []).filter((item: any) => item && (item.name || item.title)).map((item: any) => toTitle(item, list));

/** The lists a kind of title can live in, in the order a title usually moves through them. */
export const LISTS: Record<Kind, string[]> = {
  game: ["queue", "rentals", "playing", "played", "purchasedGames", "subscriptionGames", "rentalHistory"],
  film: ["movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies"],
  series: ["seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries"],
};

const mediaLists = (kind: Kind) => (kind === "film"
  ? { watchlist: "movieWatchlist", watching: "watchingMovies", watched: "watchedMovies", hidden: "hiddenMovies" }
  : { watchlist: "seriesWatchlist", watching: "watchingSeries", watched: "watchedSeries", hidden: "hiddenSeries" });

/** The key movies and shows are filed under, matching the other clients. */
export const mediaKey = (record: any, kind: Kind) => record.key || `${kind === "film" ? "tmdb" : "tmdbtv"}:${record.id != null ? record.id : norm(record.title || record.name)}`;

/** Which library list, if any, already holds this title. */
export function whereStored(data: Vault, title: Title): string {
  if (title.kind === "game") {
    const name = norm(title.name);
    return LISTS.game.find((list) => list !== "rentalHistory" && (data[list] || []).some((item: any) => norm(item.name || item.title) === name)) || "";
  }
  const key = mediaKey(title.record, title.kind);
  return LISTS[title.kind].find((list) => (data[list] || []).some((item: any) => mediaKey(item, title.kind) === key)) || "";
}

/** Removes discovery results that are already somewhere in the library. */
export function unseen(data: Vault, records: Record<string, any>[], kind: Kind, list: string): Title[] {
  return records.map((record) => toTitle(record, list, kind, false)).filter((title) => !whereStored(data, title));
}

// ---- Actions ----------------------------------------------------------------

function done(message: string): void {
  toast(message, "success", { undo: true });
}

const stamp = () => Date.now();

function mediaRecord(title: Title): Record<string, any> {
  const source = title.record;
  return normalizeRecord({ ...source, key: mediaKey(source, title.kind), title: source.title || source.name, added: source.added || stamp() }, title.kind);
}

/** Puts a movie or show in exactly one of its four lists. */
export function setMediaState(title: Title, state: "watchlist" | "watching" | "watched" | "hidden"): void {
  const lists = mediaLists(title.kind);
  const key = mediaKey(title.record, title.kind);
  captureUndo(Object.values(lists));
  vault.change((data) => {
    for (const list of Object.values(lists)) data[list] = (data[list] || []).filter((item: any) => mediaKey(item, title.kind) !== key);
    const record = mediaRecord(title);
    if (state === "watched") record.watchedAt = stamp();
    record.status = state === "watchlist" ? "Watchlist" : state === "watching" ? "Watching" : state === "watched" ? "Watched" : "Not Interested";
    data[lists[state]].unshift(record);
  });
  done(`${title.name} ${state === "watchlist" ? "added to your watchlist" : state === "watching" ? "moved to Watching" : state === "watched" ? "marked watched" : "hidden"}.`);
}

function gameRecord(title: Title, extra: Record<string, any> = {}): Record<string, any> {
  const source = title.record;
  return normalizeRecord({
    id: uid(), name: title.name, date: source.date || null, img: title.image, platforms: source.platforms || [],
    rawgId: source.rawgId ?? undefined, score: source.score ?? null, rrating: source.rrating ?? null, genre: source.genre || "",
    note: source.note || "", added: todayIso(), ...extra,
  }, "game");
}

const withoutGame = (list: any[], title: Title) => (list || []).filter((item: any) => item !== title.record && !(title.stored && item.id === title.record.id));

export function addToQueue(title: Title): void {
  if ((vault.data.queue || []).some((item: any) => norm(item.name) === norm(title.name))) { toast(`${title.name} is already in your queue.`); return; }
  captureUndo(["queue"]);
  vault.change((data) => { data.queue.push(gameRecord(title)); });
  done(`${title.name} added to your rental queue.`);
}

/** Starts a 30-day rental today from a queued, returned or discovered game. */
export function startRental(title: Title, details: { vendor?: string; cost?: number; days?: number } = {}): void {
  const days = details.days || 30;
  captureUndo(["rentals", "queue"]);
  vault.change((data) => {
    if (title.list === "queue") data.queue = withoutGame(data.queue, title);
    const start = todayIso();
    data.rentals.unshift(gameRecord(title, {
      start, days, returnDate: addDays(start, days), status: "Active",
      vendor: details.vendor ?? title.vendor, cost: details.cost ?? (title.list === "rentalHistory" ? title.cost : 0),
    }));
  });
  done(`Started a ${days}-day rental for ${title.name}.`);
}

/** Ends a rental today. It always stays in the rental history; optionally it is also marked completed. */
export function returnRental(title: Title, completed: boolean): void {
  const rental = title.record;
  captureUndo(["rentals", "rentalHistory", "played"]);
  vault.change((data) => {
    data.rentals = withoutGame(data.rentals, title);
    const used = Math.max(0, -(daysUntil(rental.start) ?? 0));
    data.rentalHistory.unshift(normalizeRecord({
      id: uid(), name: rental.name, start: rental.start, end: todayIso(), days: rental.days, used, status: "Returned",
      vendor: rental.vendor || "", cost: Number(rental.cost) || 0, note: rental.note || "", date: rental.date || null,
      img: title.image, rawgId: rental.rawgId ?? undefined, platforms: rental.platforms || [],
    }, "game"));
    if (completed && !(data.played || []).some((item: any) => norm(item.name) === norm(title.name)))
      data.played.unshift(gameRecord(title, { status: "Finished", finished: todayIso(), vendor: rental.vendor || "", cost: Number(rental.cost) || 0 }));
  });
  done(completed ? `${title.name} returned and marked completed.` : `${title.name} returned.`);
}

/** Moves a game to Playing or Completed. Owned and subscription games keep their ownership record. */
export function setGameState(title: Title, state: "playing" | "played"): void {
  const keepsSource = title.list === "purchasedGames" || title.list === "subscriptionGames" || title.list === "rentals" || !title.stored;
  captureUndo(["playing", "played", "queue", title.list]);
  vault.change((data) => {
    if (!keepsSource) data[title.list] = withoutGame(data[title.list], title);
    const name = norm(title.name);
    data.playing = (data.playing || []).filter((item: any) => norm(item.name || item.title) !== name);
    if (state === "playing") data.playing.unshift(gameRecord(title, { status: "Playing", started: todayIso() }));
    else if (!(data.played || []).some((item: any) => norm(item.name || item.title) === name))
      data.played.unshift(gameRecord(title, { status: "Finished", finished: todayIso(), vendor: title.vendor, cost: title.cost }));
  });
  done(state === "playing" ? `Now playing ${title.name}.` : `${title.name} marked completed.`);
}

/** Removes a title from the list it is in. An upcoming game is remembered so a catalog refresh cannot bring it back. */
export function removeTitle(title: Title): void {
  const lists = title.list === "upcoming" ? ["upcoming", "upcomingRemoved"] : [title.list];
  captureUndo(lists);
  vault.change((data) => {
    data[title.list] = (data[title.list] || []).filter((item: any) => item !== title.record);
    if (title.list === "upcoming") data.upcomingRemoved.unshift(title.record);
  });
  done(`${title.name} removed.`);
}

/** Saves a personal rating from 1 to 10; 0 clears it. */
export function rate(title: Title, rating: number): void {
  if (!title.stored) return;
  vault.change(() => { if (rating > 0) title.record.userRating = rating; else delete title.record.userRating; });
}

/** Saves edited fields on a stored record. Empty values remove the field. */
export function editTitle(title: Title, fields: Record<string, unknown>): void {
  captureUndo([title.list]);
  vault.change(() => {
    for (const [key, value] of Object.entries(fields)) {
      if (value === "" || value == null || (typeof value === "number" && isNaN(value))) delete title.record[key];
      else title.record[key] = value;
    }
    if (title.list === "rentals" && title.record.start && Number(title.record.days) > 0) title.record.returnDate = addDays(title.record.start, Number(title.record.days));
  });
  done(`${title.name} saved.`);
}

/** Fills in fetched details (artwork, ratings, providers) without counting as an edit. */
export function enrich(title: Title, found: Record<string, any>): void {
  if (!title.stored || !Object.keys(found).length) { Object.assign(title.record, found); return; }
  vault.changeSilently(() => {
    for (const [key, value] of Object.entries(found)) {
      const current = title.record[key];
      // Fetched text never replaces something the user or another client stored; ratings and providers do refresh.
      if (current == null || current === "" || (Array.isArray(current) && !current.length) || key === "imdb" || key === "imdbAt" || key === "tmdb" || key === "providers") title.record[key] = value;
    }
  });
}

// ---- Upcoming games ---------------------------------------------------------

/** Merges a fresh RAWG list into Upcoming: starred and hand-added entries stay, removed ones stay removed. */
export function mergeUpcoming(fetched: Record<string, any>[]): number {
  let added = 0;
  vault.change((data) => {
    const kept: any[] = (data.upcoming || []).filter((game: any) => game.want || game.src !== "auto");
    const have = new Set<string>([...kept, ...(data.upcomingRemoved || [])].map((game: any) => norm(game.name)));
    for (const game of fetched) {
      const key = norm(game.name);
      if (game.img) data.covers[key] = game.img;
      if (game.platforms?.length) data.gamePlatforms[key] = game.platforms;
      if (have.has(key)) continue;
      kept.push(game);
      have.add(key);
      added++;
    }
    data.upcoming = kept;
    data.lastUpcomingSync = Date.now();
  });
  return added;
}

// ---- Petrol -----------------------------------------------------------------

export interface Refill { id: string; date: string; gap: number | null }

/** Refills newest first, each with the days since the one before it. */
export function refills(data: Vault): Refill[] {
  const sorted = (data.petrol || []).filter((entry: any) => parseDate(entry?.date)).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
  return sorted.map((entry: any, index: number) => ({
    id: String(entry.id), date: String(entry.date),
    gap: index > 0 ? Math.round((parseDate(entry.date)!.getTime() - parseDate(sorted[index - 1].date)!.getTime()) / 86_400_000) : null,
  })).reverse();
}

export function addRefill(date: string): void {
  captureUndo(["petrol"]);
  vault.change((data) => { data.petrol.unshift({ id: String(Date.now()), date, addedAt: Date.now() }); });
  done("Refill saved.");
}

export function removeRefill(id: string): void {
  captureUndo(["petrol"]);
  vault.change((data) => { data.petrol = data.petrol.filter((entry: any) => String(entry.id) !== id); });
  done("Refill deleted.");
}

// ---- Spending ---------------------------------------------------------------

export interface Spend { label: string; amount: number }

export function spending(data: Vault): { total: number; byVendor: Spend[]; byMonth: { month: string; amount: number }[] } {
  const entries: { vendor: string; amount: number; date: string }[] = [];
  for (const item of [...(data.rentals || []), ...(data.rentalHistory || [])]) entries.push({ vendor: item.vendor || "Other rentals", amount: Number(item.cost) || 0, date: item.start || item.date || "" });
  for (const item of data.subscriptions || []) entries.push({ vendor: item.service || item.name || "Subscription", amount: Number(item.totalPaid ?? item.cost) || 0, date: item.start || "" });
  for (const item of data.purchasedGames || []) entries.push({ vendor: "Steam purchases", amount: Number(item.purchasePrice ?? item.cost) || 0, date: item.purchaseDate || item.added || "" });

  const vendors = new Map<string, number>();
  for (const entry of entries) if (entry.amount > 0) vendors.set(entry.vendor, (vendors.get(entry.vendor) || 0) + entry.amount);

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 11 + index, 1));
  const byMonth = months.map((month) => ({
    month: month.toLocaleDateString("en-GB", { month: "short" }),
    amount: entries.filter((entry) => { const date = parseDate(entry.date); return date && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(); }).reduce((sum, entry) => sum + entry.amount, 0),
  }));
  const byVendor = [...vendors].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  return { total: byVendor.reduce((sum, vendor) => sum + vendor.amount, 0), byVendor, byMonth };
}

// ---- Adding -----------------------------------------------------------------

/** Adds a searched or hand-typed game straight to one of the game lists. */
export function addGame(title: Title, list: "queue" | "playing" | "played" | "purchasedGames"): void {
  if (list === "queue") { addToQueue(title); return; }
  if (list === "playing" || list === "played") { setGameState(title, list); return; }
  captureUndo([list]);
  vault.change((data) => {
    data[list].unshift(gameRecord(title, { status: "Owned", store: "Steam", platform: "PC", permanent: true, purchaseDate: todayIso(), purchasePrice: 0 }));
  });
  done(`${title.name} added to Purchased.`);
}

/** A title typed in by hand, for when the catalog has no match or no key is saved. */
export function manualTitle(name: string, kind: Kind): Title {
  const record = kind === "game" ? { name } : { title: name, id: undefined };
  return toTitle(record, kind === "game" ? "catalogExtra" : "discover", kind, false);
}
