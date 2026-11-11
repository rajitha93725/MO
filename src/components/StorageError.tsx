export function StorageError({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="card stack">
      <h1>Can&apos;t reach the data sheet</h1>
      <div className="errors">{msg}</div>
      <p className="small">
        Check the <code>.env.local</code> values (GOOGLE_SHEET_ID, service account email and private key), that the sheet is shared with the
        service account as <b>Editor</b>, and that you ran <code>npm run setup:sheet</code>. See README → Setup.
      </p>
    </div>
  );
}
