import { formatDate, listLabel, type Title } from "../lib/library";

/** A stable colour per title, so a card without artwork is still recognisable. */
export function tint(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) & 0x7fffffff;
  return `oklch(42% 0.09 ${hash % 360})`;
}

export function initials(name: string): string {
  return name.split(/[\s\-:.]+/).filter((word) => /[\p{L}\p{N}]/u.test(word[0] || "")).slice(0, 2).map((word) => word[0].toUpperCase()).join("") || "?";
}

/** The short status shown on the artwork: a countdown where one matters, otherwise nothing. */
export function badge(title: Title): { text: string; tone: string } | null {
  const days = title.daysLeft;
  if (title.list === "rentals" && days != null)
    return days < 0 ? { text: `${-days}d overdue`, tone: "bad" } : { text: days === 0 ? "Due today" : `${days}d left`, tone: days <= 3 ? "bad" : days <= 10 ? "warn" : "" };
  if (days != null && days >= 0 && (title.list === "upcoming" || !title.stored || title.list.endsWith("Watchlist") || title.list === "queue"))
    return days === 0 ? { text: "Out today", tone: "good" } : days <= 365 ? { text: `in ${days}d`, tone: "accent" } : null;
  return null;
}

export function TitleCard({ title, onOpen, showList }: { title: Title; onOpen: (title: Title) => void; showList?: boolean }) {
  const wide = title.kind === "game";
  const mark = badge(title);
  const meta = [formatDate(title.date) || title.year, title.rating ? `★ ${title.rating.toFixed(1)}` : "", title.cost > 0 && title.list.startsWith("rental") ? `₹${title.cost}` : ""].filter(Boolean).join("  ·  ");
  const period = title.list === "rentals" && title.daysLeft != null && Number(title.record.days) > 0
    ? Math.max(0, Math.min(100, (title.daysLeft / Number(title.record.days)) * 100)) : null;
  return (
    <button className={`title-card${wide ? " wide" : ""}`} onClick={() => onOpen(title)} title={title.name}>
      <span className="art" style={{ background: tint(title.name) }}>
        <span className="initials" aria-hidden="true">{initials(title.name)}</span>
        {title.image && <img src={title.image} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0 }} onError={(event) => { event.currentTarget.style.display = "none"; }} />}
        {(mark || showList) && <span className={`chip badge ${mark?.tone || ""}`}>{mark?.text || listLabel(title.list)}</span>}
        {period != null && <span className="meter"><i style={{ width: `${period}%` }} /></span>}
      </span>
      <span>
        <span className="name">{title.name}</span>
        {meta && <span className="meta" style={{ display: "block" }}>{meta}</span>}
      </span>
    </button>
  );
}
