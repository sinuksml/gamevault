import { Inbox, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FEEDS, discoverGames, hasKey, upcomingGames } from "../lib/catalog";
import { mergeUpcoming, titlesIn, unseen, type Section, type Title } from "../lib/library";
import { settings, toast, useVault } from "../lib/store";
import type { Kind, Vault } from "../lib/vault";
import { TitleCard } from "../ui/TitleCard";

type Family = "library" | "active" | "discover" | "upcoming";

interface View {
  key: string;
  label: string;
  family: Family;
  /** Titles from the vault, or null when the view is an online feed. */
  stored?: (data: Vault) => Title[];
  feed?: (force?: boolean) => Promise<Record<string, any>[]>;
  /** Splits the titles under headings; a title with no group goes last. */
  group?: (title: Title) => string;
}

const KIND: Record<Section, Kind> = { games: "game", films: "film", series: "series" };
const NOUN: Record<Section, [string, string]> = { games: ["game", "games"], films: ["movie", "movies"], series: ["show", "shows"] };
const released = (title: Title) => (title.daysLeft != null && title.daysLeft < 0 ? "Already released" : "Coming up");

function mediaViews(section: "films" | "series"): View[] {
  const movie = section === "films";
  const list = (name: string) => (data: Vault) => titlesIn(data, name);
  const feeds = FEEDS[movie ? "film" : "series"];
  return [
    { key: "watchlist", label: "Watchlist", family: "library", stored: list(movie ? "movieWatchlist" : "seriesWatchlist") },
    { key: "watched", label: "Watched", family: "library", stored: list(movie ? "watchedMovies" : "watchedSeries") },
    { key: "hidden", label: "Not interested", family: "library", stored: list(movie ? "hiddenMovies" : "hiddenSeries") },
    { key: "watching", label: "Watching", family: "active", stored: list(movie ? "watchingMovies" : "watchingSeries") },
    ...feeds.discover.map((feed): View => ({ key: feed.key, label: feed.label, family: "discover", feed: feed.load })),
    ...feeds.upcoming.map((feed): View => ({ key: feed.key, label: feed.label, family: "upcoming", feed: feed.load })),
  ];
}

const VIEWS: Record<Section, View[]> = {
  games: [
    { key: "rentals", label: "Rentals", family: "library", stored: (data) => [...titlesIn(data, "rentals"), ...titlesIn(data, "rentalHistory")], group: (title) => (title.list === "rentals" ? "Rented now" : "Rental history") },
    { key: "queue", label: "Rental queue", family: "library", stored: (data) => titlesIn(data, "queue") },
    { key: "subscriptions", label: "Subscription games", family: "library", stored: (data) => titlesIn(data, "subscriptionGames") },
    { key: "purchased", label: "Purchased", family: "library", stored: (data) => titlesIn(data, "purchasedGames") },
    { key: "completed", label: "Completed", family: "library", stored: (data) => titlesIn(data, "played") },
    { key: "playing", label: "Now playing", family: "active", stored: (data) => titlesIn(data, "playing") },
    { key: "discover", label: "Popular recent releases", family: "discover", feed: discoverGames },
    { key: "upcoming", label: "Upcoming releases", family: "upcoming", stored: (data) => titlesIn(data, "upcoming"), group: released },
  ],
  films: mediaViews("films"),
  series: mediaViews("series"),
};

const FAMILIES: { key: Family; label: (section: Section) => string }[] = [
  { key: "library", label: () => "Library" },
  { key: "active", label: (section) => (section === "games" ? "Playing" : "Watching") },
  { key: "discover", label: () => "Discover" },
  { key: "upcoming", label: () => "Upcoming" },
];

const SORTS = [["added", "Recently added"], ["title", "Title A–Z"], ["date", "Date"], ["rating", "Highest rated"]] as const;

function sortTitles(titles: Title[], sort: string, view: View): Title[] {
  const list = titles.slice();
  const time = (title: Title) => (title.date ? new Date(title.date).getTime() || 0 : 0);
  if (sort === "title") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "rating") list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else if (sort === "date" || view.family === "upcoming" || view.key === "rentals") {
    // Dated views read soonest first for what is still ahead, newest first for what has passed.
    list.sort((a, b) => {
      const ahead = Number((b.daysLeft ?? -1) >= 0) - Number((a.daysLeft ?? -1) >= 0);
      if (ahead) return ahead;
      return (a.daysLeft ?? -1) >= 0 ? time(a) - time(b) : time(b) - time(a);
    });
  }
  // "Recently added" keeps stored order: every client inserts new records at the front.
  return list;
}

export function Library({ section, view: requested, navigate, onOpen, onAdd }: {
  section: Section; view?: string; navigate: (path: string) => void; onOpen: (title: Title) => void; onAdd: () => void;
}) {
  const data = useVault();
  const views = VIEWS[section];
  const remembered = settings.get(`next-view-${section}`);
  const view = views.find((item) => item.key === requested) || views.find((item) => item.key === remembered) || views[0];
  const siblings = views.filter((item) => item.family === view.family);
  const [sort, setSort] = useState("added");
  const [filter, setFilter] = useState("");
  const [feed, setFeed] = useState<{ key: string; items: Record<string, any>[] | null; error: string }>({ key: "", items: null, error: "" });
  const [refreshing, setRefreshing] = useState(false);
  const [singular, plural] = NOUN[section];

  useEffect(() => { if (requested && requested === view.key) settings.set(`next-view-${section}`, view.key); }, [requested, view.key, section]);
  useEffect(() => { setFilter(""); }, [section, view.key]);

  const loadFeed = (force: boolean) => {
    if (!view.feed) return;
    const key = `${section}/${view.key}`;
    setFeed((current) => (current.key === key ? { ...current, error: "" } : { key, items: null, error: "" }));
    setRefreshing(true);
    view.feed(force)
      .then((items) => setFeed({ key, items, error: "" }))
      .catch((error) => setFeed({ key, items: [], error: error instanceof Error ? error.message : "The catalog could not be loaded." }))
      .finally(() => setRefreshing(false));
  };
  const needsKey = Boolean(view.feed) && !hasKey(section === "games" ? "rawg" : "tmdb");
  useEffect(() => { if (view.feed && !needsKey) loadFeed(false); }, [section, view.key, needsKey]);

  const refresh = async () => {
    if (view.feed) { loadFeed(true); return; }
    if (section !== "games" || view.key !== "upcoming") return;
    if (!hasKey("rawg")) { toast("Save a RAWG key in Settings to refresh upcoming games."); return; }
    setRefreshing(true);
    try {
      const added = mergeUpcoming(await upcomingGames(true));
      toast(added ? `${added} upcoming ${added === 1 ? "game" : "games"} added.` : "Upcoming games are up to date.", "success");
    } catch (error) { toast(error instanceof Error ? error.message : "Refresh failed.", "error"); }
    finally { setRefreshing(false); }
  };

  const loading = Boolean(view.feed) && !needsKey && (feed.key !== `${section}/${view.key}` || feed.items === null);
  const all = useMemo(() => {
    if (view.stored) return view.stored(data);
    if (loading || !feed.items) return [];
    return unseen(data, feed.items, KIND[section], view.key);
  }, [data, view, feed, loading, section]);

  const shown = useMemo(() => {
    const text = filter.trim().toLowerCase();
    return sortTitles(text ? all.filter((title) => title.name.toLowerCase().includes(text)) : all, sort, view);
  }, [all, filter, sort, view]);

  const groups = useMemo(() => {
    if (!view.group) return [{ name: "", titles: shown }];
    const map = new Map<string, Title[]>();
    for (const title of shown) { const name = view.group(title); map.set(name, [...(map.get(name) || []), title]); }
    return [...map].map(([name, titles]) => ({ name, titles }));
  }, [shown, view]);

  const canRefresh = Boolean(view.feed) || (section === "games" && view.key === "upcoming");
  const heading = section === "games" ? "Games" : section === "films" ? "Movies" : "TV Shows";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{heading}</h1>
          <p className="muted">{view.label} · {shown.length === all.length ? `${all.length} ${all.length === 1 ? singular : plural}` : `${shown.length} of ${all.length} ${plural}`}</p>
        </div>
        {canRefresh && <button className="btn" onClick={refresh} disabled={refreshing || needsKey}><RefreshCw />{refreshing ? "Refreshing…" : "Refresh"}</button>}
        <button className="btn primary" onClick={onAdd}><Plus />Add {singular}</button>
      </div>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Browse">
          {FAMILIES.map((family) => {
            const first = views.find((item) => item.family === family.key);
            if (!first) return null;
            const target = views.find((item) => item.family === family.key && item.key === settings.get(`next-view-${section}-${family.key}`)) || first;
            return <button key={family.key} aria-pressed={view.family === family.key} onClick={() => navigate(`/${section}/${target.key}`)}>{family.label(section)}</button>;
          })}
        </div>
        {siblings.length > 1 && (
          <select className="input" value={view.key} aria-label="List" onChange={(event) => { settings.set(`next-view-${section}-${view.family}`, event.target.value); navigate(`/${section}/${event.target.value}`); }}>
            {siblings.map((item) => <option key={item.key} value={item.key}>{item.label}{item.stored ? ` (${item.stored(data).length})` : ""}</option>)}
          </select>
        )}
        <span className="grow" />
        <label className="search-trigger" style={{ maxWidth: 240, borderRadius: "var(--radius-sm)", padding: "7px 10px" }}>
          <Search /><span className="sr-only">Filter this list</span>
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter this list" style={{ border: 0, background: "none", outline: "none", width: "100%" }} />
        </label>
        <select className="input" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort by">
          {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {needsKey ? (
        <div className="empty"><Inbox /><h2>Connect a catalog</h2>
          <p>{section === "games" ? "Discover comes from RAWG." : "Discover and Upcoming come from TMDB."} Save a free API key in Settings to fill this list.</p>
          <button className="btn primary" onClick={() => navigate("/settings")}>Open Settings</button></div>
      ) : loading ? (
        <div className={`grid${section === "games" ? " wide" : ""}`} aria-busy="true">{Array.from({ length: 12 }, (_, index) => <div key={index} className="skeleton" style={section === "games" ? { aspectRatio: "16 / 9" } : undefined} />)}</div>
      ) : feed.error && view.feed && !all.length ? (
        <div className="empty"><Inbox /><h2>The catalog could not be loaded</h2><p>{feed.error}</p><button className="btn" onClick={() => loadFeed(true)}>Try again</button></div>
      ) : !shown.length ? (
        <div className="empty"><Inbox />
          <h2>{filter ? "No matches" : "Nothing here yet"}</h2>
          <p>{filter ? `Nothing in ${view.label.toLowerCase()} matches “${filter}”.` : view.feed ? "Everything in this feed is already in your library." : `${plural[0].toUpperCase()}${plural.slice(1)} you add to ${view.label.toLowerCase()} appear here.`}</p>
          {filter ? <button className="btn" onClick={() => setFilter("")}>Clear filter</button> : !view.feed && <button className="btn primary" onClick={onAdd}><Plus />Add {singular}</button>}
        </div>
      ) : groups.map((group) => (
        <section key={group.name}>
          {group.name && <div className="group-title"><h2>{group.name}</h2><span className="count">{group.titles.length}</span></div>}
          <div className={`grid${section === "games" ? " wide" : ""}`}>
            {group.titles.map((title) => <TitleCard key={title.uid} title={title} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
