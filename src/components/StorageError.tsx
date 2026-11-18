export function StorageError({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="card stack">
      <h1>Can&apos;t reach the database</h1>
      <div className="errors">{msg}</div>
      <p className="small">
        Supabase: check SUPABASE_URL and SUPABASE_SECRET_KEY, and that <code>supabase/schema.sql</code> was run in the SQL Editor.
        Google Sheet: check GOOGLE_SHEET_ID, the service account email and private key, and that the sheet is shared with the service
        account as <b>Editor</b>. See README → Setup.
      </p>
    </div>
  );
}
