import { Clapperboard, Fuel, Gamepad2, House, Search, Settings as SettingsIcon, Tv, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { syncNow, useSyncStatus } from "./lib/drive";
import { LISTS, listLabel, titlesIn, type Section, type Title } from "./lib/library";
import { dismissToast, undo, useToasts, useVault } from "./lib/store";
import type { Kind } from "./lib/vault";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { Petrol } from "./pages/Petrol";
import { Settings } from "./pages/Settings";
import { AddDialog } from "./ui/AddDialog";
import { Dialog } from "./ui/Dialog";
import { TitleSheet } from "./ui/TitleSheet";
import { tint } from "./ui/TitleCard";

interface Destination { path: string; label: string; short: string; icon: LucideIcon; group?: string }

const DESTINATIONS: Destination[] = [
  { path: "/home", label: "Home", short: "Home", icon: House },
  { path: "/games", label: "Games", short: "Games", icon: Gamepad2, group: "Library" },
  { path: "/films", label: "Movies", short: "Movies", icon: Clapperboard },
  { path: "/series", label: "TV Shows", short: "TV", icon: Tv },
  { path: "/petrol", label: "Petrol", short: "Petrol", icon: Fuel, group: "Personal" },
];

/* Hash routing: GitHub Pages cannot rewrite deep links, and a hash works at any base path. */
const subscribeHash = (listener: () => void) => { addEventListener("hashchange", listener); return () => removeEventListener("hashchange", listener); };
const readHash = () => location.hash.replace(/^#/, "") || "/home";

function go(path: string): void {
  if (readHash() === path) return;
  const apply = () => { location.hash = path; };
  // A cross-fade between pages where the browser supports it.
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(apply);
  else apply();
}

const KIND: Record<Section, Kind> = { games: "game", films: "film", series: "series" };

function CommandPalette({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (title: Title) => void }) {
  const data = useVault();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  useEffect(() => { if (open) { setQuery(""); setIndex(0); } }, [open]);

  const everything = useMemo(() => (open ? [...LISTS.game, ...LISTS.film, ...LISTS.series, "upcoming"].flatMap((list) => titlesIn(data, list)) : []), [data, open]);
  const text = query.trim().toLowerCase();
  const pages = [...DESTINATIONS, { path: "/settings", label: "Settings", short: "Settings", icon: SettingsIcon }].filter((item) => !text || item.label.toLowerCase().includes(text));
  const titles = text.length > 1 ? everything.filter((title) => title.name.toLowerCase().includes(text)).slice(0, 12) : [];
  const total = pages.length + titles.length;
  const choose = (position: number) => {
    if (position < pages.length) go(pages[position].path); else if (titles[position - pages.length]) onOpen(titles[position - pages.length]);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} label="Search" className="narrow">
      <div className="palette-input">
        <Search />
        <input autoFocus value={query} placeholder="Search your library, or jump to a page" role="combobox" aria-expanded="true" aria-controls="palette-results"
          onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setIndex((index + 1) % Math.max(1, total)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setIndex((index - 1 + total) % Math.max(1, total)); }
            else if (event.key === "Enter" && total) { event.preventDefault(); choose(index); }
          }} />
      </div>
      <div className="dialog-body" id="palette-results" role="listbox" style={{ gap: 2, minHeight: 240, alignContent: "start" }}>
        {pages.map((item, position) => (
          <button key={item.path} className="result" role="option" aria-selected={index === position} onClick={() => choose(position)}>
            <span className="thumb" style={{ display: "grid", placeItems: "center", height: 42 }}><item.icon size={18} /></span><span><b>{item.label}</b></span>
          </button>
        ))}
        {titles.map((title, position) => (
          <button key={title.uid} className="result" role="option" aria-selected={index === pages.length + position} onClick={() => choose(pages.length + position)}>
            {title.image ? <img src={title.image} alt="" loading="lazy" /> : <span className="thumb" style={{ background: tint(title.name) }} />}
            <span><b>{title.name}</b><span className="muted small">{title.kind === "game" ? "Game" : title.kind === "film" ? "Movie" : "TV show"}{title.year ? ` · ${title.year}` : ""}</span></span>
            <span className="chip">{listLabel(title.list)}</span>
          </button>
        ))}
        {text.length > 1 && total === 0 && <p className="muted small" style={{ padding: 12 }}>Nothing in your library matches “{query}”. Use Add on a library page to search the online catalogs.</p>}
      </div>
    </Dialog>
  );
}

function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((entry) => (
        <div key={entry.id} className={`toast ${entry.tone}`}>
          <span>{entry.message}</span>
          {entry.undo && <button onClick={() => { if (undo()) dismissToast(entry.id); }}>Undo</button>}
          {entry.tone === "error" && <button onClick={() => dismissToast(entry.id)} aria-label="Dismiss">✕</button>}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const data = useVault();
  const sync = useSyncStatus();
  const route = useSyncExternalStore(subscribeHash, readHash);
  const [, top = "home", view] = route.split("/");
  const section = (["games", "films", "series"] as const).find((name) => name === top);
  const [opened, setOpened] = useState<Title | null>(null);
  const [palette, setPalette] = useState(false);
  const [adding, setAdding] = useState<Kind | null>(null);
  const openTitle = useCallback((title: Title) => setOpened(title), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette(true); }
      else if (event.key === "/" && !/input|textarea|select/i.test((event.target as HTMLElement).tagName)) { event.preventDefault(); setPalette(true); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const counts: Record<string, number> = {
    "/games": (data.rentals || []).length + (data.playing || []).length + (data.queue || []).length,
    "/films": (data.movieWatchlist || []).length + (data.watchingMovies || []).length,
    "/series": (data.seriesWatchlist || []).length + (data.watchingSeries || []).length,
  };
  const current = (path: string) => (`/${top}` === path ? "page" as const : undefined);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <div className="brand"><img src="./icon.png" alt="" />Game Vault</div>
        {DESTINATIONS.map((item) => (
          <div key={item.path} style={{ display: "contents" }}>
            {item.group && <span className="overline">{item.group}</span>}
            <button className="nav-item" aria-current={current(item.path)} onClick={() => go(item.path)}>
              <item.icon />{item.label}{counts[item.path] ? <span className="count">{counts[item.path]}</span> : null}
            </button>
          </div>
        ))}
        <div className="rail-foot">
          <button className="nav-item" aria-current={current("/settings")} onClick={() => go("/settings")}><SettingsIcon />Settings</button>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <button className="search-trigger" onClick={() => setPalette(true)}><Search /><span>Search your library</span><kbd>Ctrl K</kbd></button>
          <span className="spacer" />
          <button className="sync" data-phase={sync.phase} onClick={() => (sync.phase === "local" ? go("/settings") : void syncNow({ interactive: true }))} title={sync.phase === "local" ? "Set up Google Drive sync" : "Sync now"}>
            <i aria-hidden="true" /><span>{sync.message}</span>
          </button>
        </header>

        <main className="scroll" key={`/${top}`}>
          {section ? <Library section={section} view={view} navigate={go} onOpen={openTitle} onAdd={() => setAdding(KIND[section])} />
            : top === "petrol" ? <Petrol />
            : top === "settings" ? <Settings />
            : <Home navigate={go} onOpen={openTitle} />}
        </main>

        <nav className="tabbar" aria-label="Sections">
          {[...DESTINATIONS.slice(0, 4), { path: "/settings", label: "Settings", short: "More", icon: SettingsIcon }].map((item) => (
            <button key={item.path} aria-current={current(item.path)} onClick={() => go(item.path)}><item.icon />{item.short}</button>
          ))}
        </nav>
      </div>

      <TitleSheet title={opened} onClose={() => setOpened(null)} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} onOpen={openTitle} />
      <AddDialog kind={adding || "game"} open={adding !== null} onClose={() => setAdding(null)} />
      <Toasts />
    </div>
  );
}
