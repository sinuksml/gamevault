import { Check, ExternalLink, Pencil, Play, Star, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { hasKey, mediaDetails } from "../lib/catalog";
import {
  addToQueue, editTitle, enrich, formatDate, listLabel, money, rate, removeTitle, returnRental, setGameState, setMediaState,
  startRental, toTitle, whereStored, type Title,
} from "../lib/library";
import { useVault } from "../lib/store";
import { Dialog } from "./Dialog";
import { badge, initials, tint } from "./TitleCard";

interface Action { label: string; run: () => void; primary?: boolean; icon?: ReactNode }

/** What can be done with a title, most likely step first. */
function actionsFor(title: Title, close: () => void): Action[] {
  const then = (run: () => void) => () => { run(); close(); };
  if (title.kind !== "game") {
    const current = title.stored ? title.list : "";
    const all: (Action & { list: string })[] = [
      { list: "Watchlist", label: "Add to watchlist", run: then(() => setMediaState(title, "watchlist")) },
      { list: "watching", label: "Start watching", run: then(() => setMediaState(title, "watching")), icon: <Play /> },
      { list: "watched", label: "Mark watched", run: then(() => setMediaState(title, "watched")), icon: <Check /> },
      { list: "hidden", label: "Not interested", run: then(() => setMediaState(title, "hidden")) },
    ];
    const next = all.filter((action) => !current.toLowerCase().includes(action.list.toLowerCase()));
    // The natural next step leads: watchlist → watching → watched.
    const lead = current.endsWith("Watchlist") ? "watching" : current.startsWith("watching") ? "watched" : "Watchlist";
    next.sort((a, b) => Number(b.list === lead) - Number(a.list === lead));
    if (next[0]) next[0].primary = true;
    return next;
  }
  const play: Action = { label: "Start playing", run: then(() => setGameState(title, "playing")), icon: <Play /> };
  const complete: Action = { label: "Mark completed", run: then(() => setGameState(title, "played")), icon: <Check /> };
  switch (title.stored ? title.list : "") {
    case "rentals": return [
      { label: "Return and mark completed", run: then(() => returnRental(title, true)), primary: true, icon: <Check /> },
      { label: "Return only", run: then(() => returnRental(title, false)) },
    ];
    case "rentalHistory": return [{ label: "Rent again", run: then(() => startRental(title)), primary: true }, complete];
    case "queue": return [{ label: "Start rental", run: then(() => startRental(title)), primary: true }, play, complete];
    case "playing": return [{ ...complete, primary: true }];
    case "played": return [{ ...play, label: "Play again", primary: true }];
    case "purchasedGames": case "subscriptionGames": return [{ ...play, primary: true }, complete];
    default: return [{ label: "Add to rental queue", run: then(() => addToQueue(title)), primary: true }, play, complete];
  }
}

function Editor({ title, done }: { title: Title; done: () => void }) {
  const record = title.record;
  const rental = title.list === "rentals" || title.list === "rentalHistory";
  const [form, setForm] = useState({
    vendor: String(record.vendor || record.store || ""), cost: String(record.purchasePrice ?? record.cost ?? ""),
    start: String(record.start || ""), days: String(record.days || ""), note: String(record.note || ""),
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const save = () => {
    const fields: Record<string, unknown> = { note: form.note.trim() };
    if (title.kind === "game") {
      fields[title.list === "purchasedGames" ? "store" : "vendor"] = form.vendor.trim();
      fields[title.list === "purchasedGames" ? "purchasePrice" : "cost"] = form.cost === "" ? "" : Math.max(0, Number(form.cost) || 0);
      if (rental) { fields.start = form.start; fields.days = form.days === "" ? "" : Math.max(1, Math.round(Number(form.days) || 30)); }
    }
    editTitle(title, fields);
    done();
  };
  return (
    <form className="card" style={{ display: "grid", gap: 14 }} onSubmit={(event) => { event.preventDefault(); save(); }}>
      {title.kind === "game" && (
        <div className="form-grid">
          <label className="field">{title.list === "purchasedGames" ? "Store" : "Vendor"}<input value={form.vendor} onChange={set("vendor")} /></label>
          <label className="field">Cost (₹)<input type="number" min="0" inputMode="decimal" value={form.cost} onChange={set("cost")} /></label>
          {rental && <label className="field">Rental start<input type="date" value={form.start} onChange={set("start")} /></label>}
          {rental && <label className="field">Length (days)<input type="number" min="1" value={form.days} onChange={set("days")} /></label>}
        </div>
      )}
      <label className="field">Notes<textarea rows={3} value={form.note} onChange={set("note")} /></label>
      <div className="inline" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={done}>Cancel</button>
        <button type="submit" className="btn primary">Save</button>
      </div>
    </form>
  );
}

/** Everything about one title, and the actions that move it between lists. */
export function TitleSheet({ title: opened, onClose }: { title: Title | null; onClose: () => void }) {
  const data = useVault();
  const [editing, setEditing] = useState(false);
  const [, setTick] = useState(0);

  // After an edit or a sync the stored record is a new object; show the current one.
  const fresh = opened && opened.stored ? (data[opened.list] || []).find((item: any) => item === opened.record || (item.canonicalId && item.canonicalId === opened.record.canonicalId && item.id === opened.record.id)) : null;
  // A Title is a snapshot, so it is rebuilt on every render to reflect ratings and fetched details.
  const title = !opened ? null : fresh ? toTitle(fresh, opened.list) : opened.stored ? opened : toTitle(opened.record, opened.list, opened.kind, false);

  useEffect(() => { setEditing(false); }, [opened?.uid]);

  // Fill in what a movie or show is missing the first time it is opened.
  useEffect(() => {
    if (!opened || opened.kind === "game" || !hasKey("tmdb")) return;
    const record = opened.record;
    const stale = !record.imdbAt || Date.now() - Number(record.imdbAt) > 7 * 86_400_000;
    if (record.overview && record.providers?.length && record.imdbId && !stale) return;
    let cancelled = false;
    mediaDetails(record, opened.kind).then((found) => { if (!cancelled) { enrich(opened, found); setTick((tick) => tick + 1); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [opened?.uid]);

  if (!title) return <Dialog open={false} onClose={onClose} label="Title details">{null}</Dialog>;

  const record = title.record;
  const game = title.kind === "game";
  const elsewhere = title.stored ? "" : whereStored(data, title);
  const mark = badge(title);
  const query = encodeURIComponent(title.name + (title.year ? ` ${title.year}` : ""));
  const facts: [string, string][] = ([
    ["List", title.stored ? listLabel(title.list) : elsewhere ? `Already in ${listLabel(elsewhere)}` : "Not in your library"],
    [title.list === "rentals" ? "Return by" : title.list === "rentalHistory" ? "Returned" : game ? "Release" : "Released", formatDate(title.date) || title.year],
    ["Started", formatDate(record.start)],
    ["Vendor", title.vendor],
    ["Cost", title.cost > 0 ? money(title.cost) : ""],
    ["Genre", title.genre],
    [game ? "Platforms" : "Network", title.platforms],
    ["Where to watch", game ? "" : title.providers],
    ["Runtime", record.runtime ? `${record.runtime} min` : ""],
    ["Seasons", record.seasons ? `${record.seasons}${record.episodeCount ? ` · ${record.episodeCount} episodes` : ""}` : ""],
    ["Status", title.status],
  ] as [string, string][]).filter(([, value]) => value);

  return (
    <Dialog open onClose={onClose} label={title.name}>
      <div className="hero" style={{ background: tint(title.name) }}>
        {(title.backdrop || (game && title.image)) && <img src={title.backdrop || title.image} alt="" />}
        <button className="btn icon close" onClick={onClose} aria-label="Close"><X /></button>
        <div className="hero-body">
          {!game && (title.image
            ? <img className="poster" src={title.image} alt="" />
            : <span className="poster" style={{ display: "grid", placeItems: "center", background: tint(title.name), fontWeight: 650, fontSize: "1.6rem" }}>{initials(title.name)}</span>)}
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <span className="overline" style={{ color: "oklch(100% 0 0 / 0.75)" }}>{game ? "Game" : title.kind === "film" ? "Movie" : "TV show"} · {title.stored ? listLabel(title.list) : "Discover"}</span>
            <h2>{title.name}</h2>
            <div className="links">
              {title.rating != null && <span className="chip"><Star style={{ width: 12, height: 12, fill: "currentColor" }} /> {title.ratingSource} {title.rating.toFixed(1)}</span>}
              {mark && <span className="chip">{mark.text}</span>}
              {title.year && <span className="chip">{title.year}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="dialog-body">
        <div className="toolbar">
          {actionsFor(title, onClose).map((action) => (
            <button key={action.label} className={`btn${action.primary ? " primary" : ""}`} onClick={action.run}>{action.icon}{action.label}</button>
          ))}
          <span className="grow" />
          {title.stored && <button className="btn icon" onClick={() => setEditing(!editing)} aria-label="Edit details" title="Edit details"><Pencil /></button>}
          {title.stored && <button className="btn icon danger" onClick={() => { removeTitle(title); onClose(); }} aria-label="Remove from this list" title="Remove from this list"><Trash2 /></button>}
        </div>

        {editing && <Editor title={title} done={() => setEditing(false)} />}

        {title.stored && (
          <div>
            <h3 style={{ marginBottom: 6 }}>Your rating</h3>
            <div className="stars" role="radiogroup" aria-label="Your rating out of 10">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <button key={value} role="radio" aria-checked={title.myRating === value} aria-label={`${value} out of 10`}
                  className={value <= title.myRating ? "on" : ""} onClick={() => rate(title, title.myRating === value ? 0 : value)}><Star /></button>
              ))}
              <span className="muted small" style={{ alignSelf: "center", marginLeft: 8 }}>{title.myRating ? `${title.myRating} / 10` : "Not rated"}</span>
            </div>
          </div>
        )}

        {title.overview && <div><h3 style={{ marginBottom: 6 }}>Overview</h3><p style={{ maxWidth: "70ch" }}>{title.overview}</p></div>}
        {title.note && <div><h3 style={{ marginBottom: 6 }}>Notes</h3><p className="muted" style={{ whiteSpace: "pre-wrap" }}>{title.note}</p></div>}

        <dl className="facts">{facts.map(([label, value]) => <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>

        <div className="links">
          <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://www.youtube.com/results?search_query=${query}%20official%20trailer`}><ExternalLink />Trailer</a>
          {!game && <a className="btn" target="_blank" rel="noopener noreferrer" href={record.imdbId ? `https://www.imdb.com/title/${record.imdbId}/` : `https://www.imdb.com/find/?q=${query}`}><ExternalLink />IMDb</a>}
          <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://en.wikipedia.org/w/index.php?search=${query}`}><ExternalLink />Wikipedia</a>
          {game && (title.list === "queue" || title.list === "rentals") && <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://thegamehub.in/?s=${encodeURIComponent(title.name)}`}><ExternalLink />The Game Hub</a>}
          {game && (title.list === "queue" || title.list === "rentals") && <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://gamerplanet.in/?s=${encodeURIComponent(title.name)}`}><ExternalLink />Gamer Planet</a>}
        </div>
      </div>
    </Dialog>
  );
}
