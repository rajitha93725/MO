/** Shown instantly while the next page loads its data, so a tap never feels ignored. */
export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <div className="skeleton" style={{ height: 28, width: "45%" }} />
      <div className="grid cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card skeleton" style={{ height: 86 }} />
        ))}
      </div>
      <div className="card skeleton" style={{ height: 220 }} />
      <span className="small muted">Loading…</span>
    </div>
  );
}
