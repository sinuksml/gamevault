/**
 * Online catalogs: RAWG for games, TMDB for movies and TV, OMDb for IMDb ratings.
 *
 * Keys are the user's own and stay in this browser. Records are mapped into the
 * same shape the other clients store, so a title added here looks native there.
 */
import { idb, settings } from "./store";
import { normalizeRecord, uid, type Kind } from "./vault";

export const KEYS = { rawg: "ps5-rawg-key", tmdb: "ps5-tmdb-key", omdb: "ps5-omdb-key" } as const;
export const hasKey = (name: keyof typeof KEYS) => settings.get(KEYS[name]).length > 0;

const inflight = new Map<string, Promise<any>>();

/** GET JSON with a timeout, one retry on a transient failure, and de-duplication of identical requests. */
async function getJson(url: string, label: string): Promise<any> {
  const pending = inflight.get(url);
  if (pending) return pending;
  const run = (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (response.ok) return await response.json();
        if (response.status === 401) throw new Error(`${label} rejected the API key. Check it in Settings.`);
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) { await new Promise((r) => setTimeout(r, 700)); continue; }
        throw new Error(`${label} returned ${response.status}.`);
      } catch (error) {
        if (attempt === 0 && error instanceof TypeError) { await new Promise((r) => setTimeout(r, 700)); continue; }
        throw error instanceof DOMException ? new Error(`${label} did not respond.`) : error;
      }
    }
  })();
  inflight.set(url, run);
  try { return await run; } finally { inflight.delete(url); }
}

// ---- A small cache for discovery feeds --------------------------------------

interface Cached<T> { at: number; items: T[] }
const FEED_TTL = 12 * 60 * 60 * 1000;
let feedCache: Record<string, Cached<any>> | null = null;

async function cached<T>(key: string, force: boolean, load: () => Promise<T[]>): Promise<T[]> {
  feedCache ??= (await idb.get<Record<string, Cached<any>>>("next-feeds")) || {};
  const hit = feedCache[key];
  if (hit && !force && Date.now() - hit.at < FEED_TTL) return hit.items;
  try {
    const items = await load();
    feedCache[key] = { at: Date.now(), items };
    void idb.put("next-feeds", feedCache);
    return items;
  } catch (error) {
    // A stale list is more useful than an empty one when the network is down.
    if (hit) return hit.items;
    throw error;
  }
}

export function feedAge(key: string): number | null {
  return feedCache?.[key] ? feedCache[key].at : null;
}

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const daysFromNow = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return iso(date); };

// ---- RAWG -------------------------------------------------------------------

const RAWG = "https://api.rawg.io/api/games";
const PLATFORMS = "187,186,4";   // PS5, Xbox Series, PC

function rawgUrl(params: Record<string, string | number>): string {
  const query = new URLSearchParams({ key: settings.get(KEYS.rawg), platforms: PLATFORMS, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `${RAWG}?${query}`;
}

function platforms(game: any): string[] {
  const out: string[] = [];
  for (const entry of game?.platforms || []) {
    const name = String(entry.platform?.name || "").toLowerCase();
    const label = name.includes("playstation 5") ? "PS5" : name.includes("xbox series") || name === "xbox one" ? "Xbox" : name === "pc" ? "PC" : "";
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

function mapGame(game: any): Record<string, any> {
  return normalizeRecord({
    id: uid(), name: game.name, date: game.released || null,
    year: game.released ? Number(game.released.slice(0, 4)) : null,
    genre: (game.genres || []).slice(0, 3).map((genre: any) => genre.name).join(" · "),
    score: game.metacritic || null, rrating: game.rating || null,
    tier: game.added >= 8000 ? "AAA" : game.added >= 2500 ? "AA" : "Indie",
    img: game.background_image || "", platforms: platforms(game), rawgId: game.id,
  }, "game");
}

const named = (results: any[]) => (results || []).filter((game) => game?.name);

export async function searchGames(query: string): Promise<Record<string, any>[]> {
  const json = await getJson(rawgUrl({ search: query, page_size: 12, search_precise: "true" }), "RAWG");
  return named(json.results).map(mapGame);
}

export const upcomingGames = (force = false) => cached("games-upcoming", force, async () => {
  const json = await getJson(rawgUrl({ dates: `${daysFromNow(0)},${daysFromNow(365)}`, ordering: "-added", page_size: 40 }), "RAWG");
  return named(json.results).map((game) => ({ ...mapGame(game), src: "auto", want: false, note: (game.genres || []).slice(0, 3).map((g: any) => g.name).join(" · ") }));
});

export const discoverGames = (force = false) => cached("games-discover", force, async () => {
  const json = await getJson(rawgUrl({ dates: `${daysFromNow(-540)},${daysFromNow(0)}`, ordering: "-added", page_size: 40 }), "RAWG");
  return named(json.results).map(mapGame);
});

// ---- TMDB -------------------------------------------------------------------

const TMDB = "https://api.themoviedb.org/3";
const poster = (path?: string) => (path ? `https://image.tmdb.org/t/p/w342${path}` : "");
const backdrop = (path?: string) => (path ? `https://image.tmdb.org/t/p/w1280${path}` : "");

function tmdb(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const query = new URLSearchParams({ api_key: settings.get(KEYS.tmdb), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return getJson(`${TMDB}${path}?${query}`, "TMDB");
}

function mapMovie(movie: any): Record<string, any> {
  return normalizeRecord({
    id: movie.id, title: movie.title || movie.name || "Untitled",
    date: movie.release_date || "", originalDate: movie.release_date || "", year: (movie.release_date || "").slice(0, 4),
    originalLanguage: movie.original_language || "", overview: movie.overview || "",
    tmdb: Math.round((movie.vote_average || 0) * 10) / 10, genres: movie.genre_ids || [],
    votes: movie.vote_count || 0, popularity: movie.popularity || 0,
    poster: poster(movie.poster_path), backdrop: backdrop(movie.backdrop_path),
  }, "film");
}

function mapSeries(show: any): Record<string, any> {
  return normalizeRecord({
    id: show.id, title: show.name || show.original_name || "Untitled",
    date: show.first_air_date || "", firstAirDate: show.first_air_date || "", latestDate: show.last_air_date || "",
    year: (show.first_air_date || "").slice(0, 4), overview: show.overview || "",
    tmdb: Math.round((show.vote_average || 0) * 10) / 10, votes: show.vote_count || 0, popularity: show.popularity || 0,
    genres: show.genre_ids || [], originalLanguage: show.original_language || "",
    poster: poster(show.poster_path), backdrop: backdrop(show.backdrop_path),
  }, "series");
}

const withPoster = (items: Record<string, any>[]) => items.filter((item) => item.poster);

export async function searchMedia(query: string, kind: Kind): Promise<Record<string, any>[]> {
  const json = await tmdb(kind === "film" ? "/search/movie" : "/search/tv", { query, include_adult: "false", page: 1 });
  return (json.results || []).slice(0, 14).map(kind === "film" ? mapMovie : mapSeries);
}

export interface Feed { key: string; label: string; load: (force?: boolean) => Promise<Record<string, any>[]> }

async function pages(path: string, params: Record<string, string | number>, count: number): Promise<any[]> {
  const results = await Promise.all(Array.from({ length: count }, (_, index) => tmdb(path, { ...params, page: index + 1 })));
  const seen = new Set<number>();
  return results.flatMap((page) => page.results || []).filter((item) => !seen.has(item.id) && seen.add(item.id));
}

export const FEEDS: Record<"film" | "series", { discover: Feed[]; upcoming: Feed[] }> = {
  film: {
    discover: [
      { key: "film-trending", label: "Trending this week", load: (force) => cached("film-trending", !!force, async () => withPoster((await pages("/trending/movie/week", {}, 2)).map(mapMovie))) },
      { key: "film-acclaimed", label: "Recent and well reviewed", load: (force) => cached("film-acclaimed", !!force, async () => withPoster((await pages("/discover/movie", {
        "primary_release_date.gte": daysFromNow(-240), "primary_release_date.lte": daysFromNow(0), "vote_count.gte": 150, "vote_average.gte": 6.8, sort_by: "popularity.desc",
      }, 2)).map(mapMovie))) },
      { key: "film-malayalam", label: "Malayalam", load: (force) => cached("film-malayalam", !!force, async () => withPoster((await pages("/discover/movie", {
        with_original_language: "ml", "primary_release_date.gte": daysFromNow(-365), "primary_release_date.lte": daysFromNow(0), sort_by: "popularity.desc",
      }, 2)).map(mapMovie))) },
    ],
    upcoming: [
      { key: "film-upcoming", label: "Coming soon", load: (force) => cached("film-upcoming", !!force, async () => withPoster((await pages("/discover/movie", {
        "primary_release_date.gte": daysFromNow(1), "primary_release_date.lte": daysFromNow(270), sort_by: "popularity.desc", with_release_type: "2|3",
      }, 2)).map(mapMovie))) },
    ],
  },
  series: {
    discover: [
      { key: "series-trending", label: "Trending this week", load: (force) => cached("series-trending", !!force, async () => withPoster((await pages("/trending/tv/week", {}, 2)).map(mapSeries))) },
      { key: "series-airing", label: "New episodes", load: (force) => cached("series-airing", !!force, async () => withPoster((await pages("/tv/on_the_air", {}, 2)).map(mapSeries))) },
      { key: "series-acclaimed", label: "Top rated, recent", load: (force) => cached("series-acclaimed", !!force, async () => withPoster((await pages("/discover/tv", {
        "first_air_date.gte": daysFromNow(-720), "vote_count.gte": 120, "vote_average.gte": 7.6, sort_by: "popularity.desc",
      }, 2)).map(mapSeries))) },
    ],
    upcoming: [
      { key: "series-upcoming", label: "Upcoming shows", load: (force) => cached("series-upcoming", !!force, async () => withPoster((await pages("/discover/tv", {
        "first_air_date.gte": daysFromNow(1), "first_air_date.lte": daysFromNow(270), sort_by: "popularity.desc",
      }, 2)).map(mapSeries))) },
    ],
  },
};

const GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western", 10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

/** Genre names for a record, whether it stores TMDB ids, objects or plain text. */
export function genreNames(record: any): string {
  if (typeof record?.genre === "string" && record.genre) return record.genre.replace(/\s*·\s*/g, ", ");
  if (!Array.isArray(record?.genres)) return "";
  return record.genres.map((genre: any) => (typeof genre === "object" ? genre?.name : GENRES[Number(genre)] || (isNaN(Number(genre)) ? String(genre) : ""))).filter(Boolean).slice(0, 3).join(", ");
}

/**
 * Fills in what a search result or an old record lacks: runtime, IMDb id,
 * where to watch in India, seasons, and the IMDb rating when an OMDb key is saved.
 * @returns only the fields that were found, to merge into the record.
 */
export async function mediaDetails(record: any, kind: Kind): Promise<Record<string, any>> {
  const id = record.tmdbId ?? record.id;
  if (id == null || !hasKey("tmdb") || isNaN(Number(id))) return {};
  const detail = await tmdb(`/${kind === "film" ? "movie" : "tv"}/${id}`, { append_to_response: "external_ids,watch/providers" });
  const found: Record<string, any> = {};
  const set = (key: string, value: unknown) => { if (value != null && value !== "" && !(Array.isArray(value) && !value.length)) found[key] = value; };
  set("overview", detail.overview);
  set("poster", poster(detail.poster_path));
  set("backdrop", backdrop(detail.backdrop_path));
  set("genres", (detail.genres || []).map((genre: any) => genre.id));
  set("imdbId", detail.imdb_id || detail.external_ids?.imdb_id);
  set("tmdb", Math.round((detail.vote_average || 0) * 10) / 10 || null);
  const region = detail["watch/providers"]?.results?.IN || detail["watch/providers"]?.results?.US;
  set("providers", [...(region?.flatrate || []), ...(region?.free || [])].map((provider: any) => provider.provider_name));
  if (kind === "film") set("runtime", detail.runtime);
  else {
    set("seasons", detail.number_of_seasons);
    set("episodeCount", detail.number_of_episodes);
    set("networks", (detail.networks || []).map((network: any) => network.name).filter(Boolean));
    set("latestDate", detail.next_episode_to_air?.air_date || detail.last_episode_to_air?.air_date || detail.last_air_date);
  }
  const imdbId = found.imdbId || record.imdbId;
  if (imdbId && hasKey("omdb")) {
    try {
      const omdb = await getJson(`https://www.omdbapi.com/?apikey=${encodeURIComponent(settings.get(KEYS.omdb))}&i=${encodeURIComponent(imdbId)}`, "OMDb");
      const rating = Number(omdb.imdbRating);
      if (rating > 0) { found.imdb = rating; found.imdbAt = Date.now(); }
    } catch { /* the TMDB rating remains */ }
  }
  return found;
}
