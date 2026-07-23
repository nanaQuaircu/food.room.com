export default function Loading() {
  return (
    <div className="premium-page p-4" aria-busy="true" aria-live="polite">
      <div className="premium-loading">
        <div className="premium-loading__spinner" aria-hidden="true" />
        <span>Loading…</span>
      </div>
    </div>
  );
}
