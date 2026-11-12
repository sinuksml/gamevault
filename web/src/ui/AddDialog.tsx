import { Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { hasKey, searchGames, searchMedia } from "../lib/catalog";
import { addGame, formatDate, listLabel, manualTitle, setMediaState, toTitle, whereStored, type Title } from "../lib/library";
import { useVault } from "../lib/store";
import type { Kind } from "../lib/vault";
import { Dialog } from "./Dialog";
import { tint } from "./TitleCard";

const GAME_TARGETS = [["queue", "Rental queue"], ["playing", "Now playing"], ["played", "Completed"], ["purchasedGames", "Purchased"]] as const;
const MEDIA_TARGETS = [["watchlist", "Watchlist"], ["watching", "Watching"], ["watched", "Watched"]] as const;

/** Search the catalog and add a result, or type a title in when the catalog has nothing. */
export function AddDialog({ kind, open, onClose }: { kind: Kind; open: boolean; onClose: () => void }) {
  const data = useVault();
  const game = kind === "game";
  const canSearch = hasKey(game ? "rawg" : "tmdb");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string>(game ? "queue" : "watchlist");
  const [results, setResults] = useState<Title[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const sequence = useRef(0);

  useEffect(() => { if (open) { setQuery(""); setResults([]); setState("idle"); setTarget(game ? "queue" : "watchlist"); } }, [open, game]);

  useEffect(() => {
    const text = query.trim();
    if (!canSearch || text.length < 2) { setResults([]); setState("idle"); return; }
    const run = ++sequence.current;
    setState("loading");
    const timer = setTimeout(async () => {
      try {
        const found = game ? await searchGames(text) : await searchMedia(text, kind);
        if (run !== sequence.current) return;   // a newer search replaced this one
        setResults(found.map((record) => toTitle(record, game ? "catalogExtra" : "discover", kind, false)));
        setState("idle");
      } catch (problem) {
        if (run !== sequence.current) return;
        setError(problem instanceof Error ? problem.message : "Search failed.");
        setState("error");
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [query, kind, game, canSearch]);

  const add = (title: Title) => {
    if (game) addGame(title, target as "queue");
    else setMediaState(title, target as "watchlist");
    onClose();
  };
  const noun = game ? "game" : kind === "film" ? "movie" : "TV show";
  const typed = query.trim();

  return (
    <Dialog open={open} onClose={onClose} label={`Add a ${noun}`} className="narrow">
      <div className="palette-input">
        <Search />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={canSearch ? `Search for a ${noun}` : `Type the ${noun}'s title`}
          onKeyDown={(event) => { if (event.key === "Enter" && results[0]) add(results[0]); else if (event.key === "Enter" && typed.length > 1 && !canSearch) add(manualTitle(typed, kind)); }} />
        <select className="input" value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Add to">
          {(game ? GAME_TARGETS : MEDIA_TARGETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="dialog-body" style={{ gap: 4, minHeight: 260, alignContent: "start" }}>
        {!canSearch && <p className="muted small">Save a {game ? "RAWG" : "TMDB"} key in Settings to search with artwork and ratings. Until then, type the title and press Enter.</p>}
        {state === "loading" && <p className="muted small">Searching…</p>}
        {state === "error" && <p className="small" style={{ color: "var(--bad)" }}>{error}</p>}
        {results.map((title) => {
          const stored = whereStored(data, title);
          return (
            <button key={title.uid} className="result" onClick={() => add(title)}>
              {title.image ? <img className={game ? "wide" : ""} src={title.image} alt="" loading="lazy" /> : <span className={`thumb${game ? " wide" : ""}`} style={{ background: tint(title.name) }} />}
              <span><b>{title.name}</b><span className="muted small">{[formatDate(title.date) || title.year, title.genre, title.rating ? `★ ${title.rating.toFixed(1)}` : ""].filter(Boolean).join("  ·  ")}</span></span>
              {stored && <span className="chip">{listLabel(stored)}</span>}
            </button>
          );
        })}
        {typed.length > 1 && state === "idle" && (
          <button className="result" onClick={() => add(manualTitle(typed, kind))}>
            <span className={`thumb${game ? " wide" : ""}`} style={{ display: "grid", placeItems: "center" }}><Plus /></span>
            <span><b>Add “{typed}” as typed</b><span className="muted small">Without catalog details</span></span>
          </button>
        )}
      </div>
    </Dialog>
  );
}
