import { ArrowRight } from "lucide-react";
import { useSyncStatus } from "../lib/drive";
import { daysUntil, formatDate, money, refills, rentalDue, spending, titlesIn, type Title } from "../lib/library";
import { useVault } from "../lib/store";
import { vaultSize } from "../lib/vault";
import { TitleCard, initials, tint } from "../ui/TitleCard";

interface Due { name: string; kind: string; date: string; days: number | null; image: string; detail: string }

function tone(days: number | null): string {
  return days == null ? "var(--muted)" : days <= 3 ? "var(--bad)" : days <= 10 ? "var(--warn)" : "var(--good)";
}

function countdown(days: number | null): string {
  return days == null ? "—" : days < 0 ? `${-days}d over` : days === 0 ? "Today" : `${days}d`;
}

/** The first page: what is in progress, what is due, and where the money went. */
export function Home({ navigate, onOpen }: { navigate: (path: string) => void; onOpen: (title: Title) => void }) {
  const data = useVault();
  const sync = useSyncStatus();
  const hour = new Date().getHours();

  const playing = [...titlesIn(data, "playing"), ...titlesIn(data, "rentals")].filter((title, index, all) => all.findIndex((other) => other.name === title.name) === index);
  const watching = [...titlesIn(data, "watchingMovies"), ...titlesIn(data, "watchingSeries")];
  const upcoming = [...titlesIn(data, "upcoming"), ...titlesIn(data, "movieWatchlist"), ...titlesIn(data, "seriesWatchlist"), ...titlesIn(data, "queue")]
    .filter((title) => title.daysLeft != null && title.daysLeft >= 0 && title.daysLeft <= 180).sort((a, b) => a.daysLeft! - b.daysLeft!).slice(0, 6);

  const due: Due[] = [
    ...(data.rentals || []).map((rental: any): Due => ({
      name: rental.name, kind: "Rental return", date: rentalDue(rental), days: daysUntil(rentalDue(rental)),
      image: rental.img || "", detail: [rental.vendor, Number(rental.cost) > 0 ? money(Number(rental.cost)) : ""].filter(Boolean).join(" · "),
    })),
    ...(data.subscriptions || []).filter((plan: any) => String(plan.active) !== "false").map((plan: any): Due => {
      const date = plan.renewsAt || plan.end || "";
      const cost = Number(plan.monthlyCost ?? plan.cost) || 0;
      return { name: plan.service || plan.name || "Subscription", kind: "Renewal", date, days: daysUntil(date), image: "", detail: cost > 0 ? `${money(cost)} a month` : "" };
    }),
  ].filter((entry) => entry.name).sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

  const spend = spending(data);
  const peak = Math.max(1, ...spend.byMonth.map((month) => month.amount));
  const petrol = refills(data);
  const sinceFill = petrol[0] ? -(daysUntil(petrol[0].date) ?? 0) : null;
  const stats: [string, string, string, string][] = [
    ["Rented now", String((data.rentals || []).length), "games", "/games/rentals"],
    ["Playing", String(playing.length), "in progress", "/games/playing"],
    ["Watchlist", String((data.movieWatchlist || []).length + (data.seriesWatchlist || []).length), "movies and shows", "/films/watchlist"],
    ["Completed", String((data.played || []).length), "games finished", "/games/completed"],
    ["Watched", String((data.watchedMovies || []).length + (data.watchedSeries || []).length), "movies and shows", "/films/watched"],
    ["Spent", money(spend.total), "rentals, plans, purchases", ""],
  ];

  return (
    <div className="page">
      <div>
        <h1>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}</h1>
        <p className="muted">{playing.length} in progress · {due.length} {due.length === 1 ? "date" : "dates"} to keep · {sync.message}</p>
      </div>

      {vaultSize(data) === 0 && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h2>Your library is empty on this device</h2>
          <p className="muted">Sign in to Google Drive in Settings to bring back a library you already have, or add your first title.</p>
          <div className="inline"><button className="btn primary" onClick={() => navigate("/settings")}>Open Settings</button><button className="btn" onClick={() => navigate("/games/queue")}>Add a game</button></div>
        </div>
      )}

      <div className="stats">
        {stats.map(([label, value, caption, path]) => path
          ? <button key={label} className="stat" onClick={() => navigate(path)}><span className="overline">{label}</span><b>{value}</b><span className="muted small">{caption}</span></button>
          : <div key={label} className="stat"><span className="overline">{label}</span><b>{value}</b><span className="muted small">{caption}</span></div>)}
      </div>

      {playing.length > 0 && (
        <section>
          <div className="panel-head"><h2>Continue playing</h2><button className="btn ghost" onClick={() => navigate("/games/playing")}>All games<ArrowRight /></button></div>
          <div className="shelf wide">{playing.slice(0, 10).map((title) => <TitleCard key={title.uid} title={title} onOpen={onOpen} showList />)}</div>
        </section>
      )}
      {watching.length > 0 && (
        <section>
          <div className="panel-head"><h2>Continue watching</h2><button className="btn ghost" onClick={() => navigate("/films/watching")}>All movies<ArrowRight /></button></div>
          <div className="shelf">{watching.slice(0, 14).map((title) => <TitleCard key={title.uid} title={title} onOpen={onOpen} />)}</div>
        </section>
      )}

      <div className="panels">
        <section className="card">
          <div className="panel-head"><h2>Due dates</h2><span className="muted small">{due.length ? `${due.length} tracked` : "Nothing due"}</span></div>
          <div className="rows">
            {due.length === 0 && <p className="muted small">Active rentals and subscription renewals appear here.</p>}
            {due.slice(0, 8).map((entry, index) => (
              <div key={index} className="row">
                {entry.image ? <img src={entry.image} alt="" loading="lazy" /> : <span className="thumb" style={{ background: tint(entry.name) }}>{initials(entry.name)}</span>}
                <span><b>{entry.name}</b><span className="muted small">{[entry.kind, entry.detail].filter(Boolean).join(" · ")}</span></span>
                <span className="end" style={{ color: tone(entry.days) }}>{countdown(entry.days)}<span className="muted small" style={{ display: "block", fontWeight: 400 }}>{formatDate(entry.date)}</span></span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="panel-head"><h2>Coming up</h2><span className="muted small">From your lists</span></div>
          <div className="rows">
            {upcoming.length === 0 && <p className="muted small">Releases you are waiting for appear here.</p>}
            {upcoming.map((title) => (
              <button key={title.uid} className="row" onClick={() => onOpen(title)}>
                {title.image ? <img src={title.image} alt="" loading="lazy" /> : <span className="thumb" style={{ background: tint(title.name) }}>{initials(title.name)}</span>}
                <span><b>{title.name}</b><span className="muted small">{title.kind === "game" ? "Game" : title.kind === "film" ? "Movie" : "TV show"} · {formatDate(title.date)}</span></span>
                <span className="end" style={{ color: "var(--accent)" }}>{countdown(title.daysLeft)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="panel-head"><h2>Spending</h2><span className="muted small">Last 12 months</span></div>
          <div className="bars" role="img" aria-label="Spending by month">
            {spend.byMonth.map((month, index) => (
              <div key={index} title={`${month.month}: ${money(month.amount)}`}>
                <i className={month.amount ? "" : "zero"} style={{ height: month.amount ? `${Math.max(4, (month.amount / peak) * 100)}%` : 3 }} />{month.month}
              </div>
            ))}
          </div>
          <div className="rows" style={{ marginTop: 14 }}>
            {spend.byVendor.slice(0, 5).map((vendor) => <div key={vendor.label} className="row"><span><b>{vendor.label}</b></span><span className="end">{money(vendor.amount)}</span></div>)}
          </div>
        </section>

        <section className="card">
          <div className="panel-head"><h2>Petrol</h2><button className="btn ghost" onClick={() => navigate("/petrol")}>Log a refill<ArrowRight /></button></div>
          <div className="inline" style={{ alignItems: "baseline" }}><span className="big-number">{sinceFill ?? "—"}</span><span className="muted">{sinceFill == null ? "no refills logged" : sinceFill === 1 ? "day since the last fill" : "days since the last fill"}</span></div>
          {petrol[0] && <p className="muted small" style={{ marginTop: 8 }}>Last filled {formatDate(petrol[0].date)} · {petrol.length} refills recorded</p>}
        </section>
      </div>
    </div>
  );
}
