import { Trash2 } from "lucide-react";
import { useState } from "react";
import { addRefill, daysUntil, formatDate, refills, removeRefill, todayIso } from "../lib/library";
import { useVault } from "../lib/store";

/** Logs petrol refills and shows how long each tank lasted. Only the date is stored. */
export function Petrol() {
  const data = useVault();
  const [date, setDate] = useState(todayIso());
  const history = refills(data);
  const since = history[0] ? -(daysUntil(history[0].date) ?? 0) : null;
  const gaps = history.map((entry) => entry.gap).filter((gap): gap is number => gap != null);
  const average = gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : null;

  return (
    <div className="page" style={{ maxWidth: 860, marginInline: 0 }}>
      <div><h1>Petrol</h1><p className="muted">Honda Activa refills. The gaps are worked out from the dates.</p></div>
      <div className="stats">
        <div className="stat"><span className="overline">Days since last fill</span><b>{since ?? "—"}</b><span className="muted small">{history[0] ? `Filled ${formatDate(history[0].date)}` : "No refills yet"}</span></div>
        <div className="stat"><span className="overline">Typical gap</span><b>{average ?? "—"}</b><span className="muted small">days between refills</span></div>
        <div className="stat"><span className="overline">Refills</span><b>{history.length}</b><span className="muted small">recorded</span></div>
      </div>
      <form className="card inline" onSubmit={(event) => { event.preventDefault(); if (date) { addRefill(date); setDate(todayIso()); } }}>
        <label className="field" style={{ minWidth: 200 }}>Refill date<input type="date" value={date} max={todayIso()} onChange={(event) => setDate(event.target.value)} required /></label>
        <button className="btn primary" type="submit">Save refill</button>
      </form>
      <section>
        <h2 style={{ marginBottom: 12 }}>History</h2>
        {history.length === 0 && <p className="muted">Your refills will be listed here, newest first.</p>}
        {history.length > 0 && (
          <div className="rows card" style={{ padding: 8 }}>
            {history.map((entry, index) => (
              <div key={entry.id} className="row">
                <span><b>{formatDate(entry.date)}</b><span className="muted small">{index === 0 ? "Most recent fill" : entry.gap == null ? "First refill" : `${entry.gap} days after the one before`}</span></span>
                <button className="btn icon ghost danger" onClick={() => removeRefill(entry.id)} aria-label={`Delete the refill on ${formatDate(entry.date)}`} title="Delete this refill"><Trash2 /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
