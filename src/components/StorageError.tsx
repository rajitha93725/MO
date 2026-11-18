export function StorageError({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="card stack">
      <h1>Can&apos;t reach the database</h1>
      <div className="errors">{msg}</div>
      <p className="small">
        Check SUPABASE_URL and SUPABASE_SECRET_KEY, and that <code>supabase/schema.sql</code> was run in Supabase → SQL Editor.
        See README → Setup.
      </p>
    </div>
  );
}
