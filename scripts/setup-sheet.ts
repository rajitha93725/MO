/**
 * Creates every tab with its header row and seeds starting data.
 *
 *   npm run setup:sheet   -> the one sheet (GOOGLE_SHEET_ID): menu, settings, targets, fixed costs, users. No sample data.
 *   (Sample data is only used by the in-memory demo mode, DATA_BACKEND=memory.)
 *
 * Safe to re-run: existing tabs are kept, and a tab is only seeded when it has no data rows.
 */
import { config } from "dotenv";
import { JWT } from "google-auth-library";
import { HEADERS, TABS, TEXT_COLUMNS, type TabKey } from "../src/lib/data/schema";
import { seedFixedCosts, seedMenu, seedSettingsRows, seedTargets, seedUsers } from "../src/lib/data/seed";
config({ path: ".env.local" });
config();

const sheetId = process.env.GOOGLE_SHEET_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!sheetId || !email || !key) {
  console.error("Missing GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in .env.local");
  process.exit(1);
}

const auth = new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const API = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

async function req(path: string, init: RequestInit = {}) {
  const { token } = await auth.getAccessToken();
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const rng = (tab: TabKey, a1: string) => encodeURIComponent(`'${TABS[tab]}'!${a1}`);

function toValues(tab: TabKey, rows: object[]) {
  return rows.map((r: any) => HEADERS[tab].map((h) => (h === "active" ? (r[h] ? "yes" : "no") : r[h] ?? "")));
}

async function main() {
  console.log(`Setting up sheet ${sheetId}`);
  const meta = await req(`?fields=sheets.properties(sheetId,title)`);
  const existing = new Map<string, number>(meta.sheets.map((s: any) => [s.properties.title, s.properties.sheetId]));

  // 1) create missing tabs
  const add = (Object.keys(TABS) as TabKey[]).filter((k) => !existing.has(TABS[k]));
  if (add.length) {
    const r = await req(`:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: add.map((k) => ({ addSheet: { properties: { title: TABS[k], gridProperties: { frozenRowCount: 1 } } } })) }),
    });
    r.replies.forEach((rep: any, i: number) => existing.set(TABS[add[i]], rep.addSheet.properties.sheetId));
    console.log("Created tabs:", add.map((k) => TABS[k]).join(", "));
  }

  // 2) header rows (bold, frozen)
  for (const k of Object.keys(TABS) as TabKey[]) {
    await req(`/values/${rng(k, "A1")}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [HEADERS[k]] }) });
  }
  await req(`:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: (Object.keys(TABS) as TabKey[]).flatMap((k) => [
        { repeatCell: { range: { sheetId: existing.get(TABS[k]), startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.99, green: 0.9, blue: 0.87 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
        { updateSheetProperties: { properties: { sheetId: existing.get(TABS[k]), gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
      ]).concat(
        // Date / month / time / settings-value columns as plain text, so Sheets never converts "2026-12" or "6,7,8,9,10".
        (Object.keys(TEXT_COLUMNS) as TabKey[]).flatMap((k) =>
          TEXT_COLUMNS[k]!.map((col) => {
            const c = HEADERS[k].indexOf(col);
            return {
              repeatCell: {
                range: { sheetId: existing.get(TABS[k]), startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
                fields: "userEnteredFormat.numberFormat",
              },
            } as any;
          }),
        ),
      ).concat([
        // Todo.done as a real checkbox in the sheet
        {
          setDataValidation: {
            range: { sheetId: existing.get(TABS.todo), startRowIndex: 1, startColumnIndex: HEADERS.todo.indexOf("done"), endColumnIndex: HEADERS.todo.indexOf("done") + 1 },
            rule: { condition: { type: "BOOLEAN" } },
          },
        } as any,
      ]),
    }),
  });

  // 3) seed empty tabs
  const seedIfEmpty = async (tab: TabKey, rows: object[]) => {
    const data = await req(`/values/${rng(tab, "A2:A3")}`);
    if (data.values?.length) {
      console.log(`  ${TABS[tab]}: has data, left unchanged`);
      return;
    }
    if (!rows.length) return;
    await req(`/values/${rng(tab, "A2")}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: toValues(tab, rows) }) });
    console.log(`  ${TABS[tab]}: seeded ${rows.length} rows`);
  };

  const menu = seedMenu();
  const fixed = seedFixedCosts();
  await seedIfEmpty("menu", menu);
  await seedIfEmpty("settings", seedSettingsRows());
  await seedIfEmpty("targets", seedTargets());
  await seedIfEmpty("users", seedUsers());
  await seedIfEmpty("fixedCosts", fixed);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
