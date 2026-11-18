/**
 * Copies every Google Sheet tab into Supabase:  npm run copy:supabase
 * Only adds rows whose ID is not in Supabase yet, so it is safe to run again (e.g. to catch up
 * orders entered while switching over). It never changes or deletes rows already in Supabase.
 * Needs in .env.local: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
 * SUPABASE_URL, SUPABASE_SECRET_KEY.
 */
import { config } from "dotenv";
import { SheetsStore } from "../src/lib/data/sheetsStore";
import { SupabaseStore } from "../src/lib/data/supabaseStore";
import { ID_COLUMN, TABS, type TabKey } from "../src/lib/data/schema";
config({ path: ".env.local" });

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

async function main() {
  const sheet = new SheetsStore(need("GOOGLE_SHEET_ID"), need("GOOGLE_SERVICE_ACCOUNT_EMAIL"), need("GOOGLE_PRIVATE_KEY"));
  const db = new SupabaseStore(need("SUPABASE_URL"), need("SUPABASE_SECRET_KEY"));
  let problems = 0;
  for (const tab of Object.keys(TABS) as TabKey[]) {
    const id = ID_COLUMN[tab];
    const rows = await sheet.listFresh(tab);
    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      const k = String(r[id]);
      if (seen.has(k)) {
        console.log(`  ! ${TABS[tab]}: duplicate ${id} "${k}" in the sheet – only the first is copied`);
        problems++;
        return false;
      }
      seen.add(k);
      return true;
    });
    const have = new Set((await db.list(tab)).map((r) => String(r[id])));
    const missing = unique.filter((r) => !have.has(String(r[id])));
    await db.insert(tab, missing, { ignoreDuplicates: true });
    const after = (await db.list(tab)).length;
    const ok = unique.every((r) => have.has(String(r[id]))) || after >= unique.length;
    if (!ok) problems++;
    console.log(`${ok ? "✓" : "✗"} ${TABS[tab].padEnd(20)} sheet ${String(rows.length).padStart(5)}  added ${String(missing.length).padStart(5)}  now in Supabase ${String(after).padStart(5)}`);
  }
  console.log(problems ? `\nFinished with ${problems} warning(s) – see above.` : "\nAll tabs copied.");
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
