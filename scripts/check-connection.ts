/** Read-only check that the service account can open the sheet: npx tsx scripts/check-connection.ts */
import { config } from "dotenv";
import { JWT } from "google-auth-library";
config({ path: ".env.local" });

async function main() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const { token } = await auth.getAccessToken();
  const id = process.env.GOOGLE_SHEET_ID;
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) {
    console.log("FAILED", res.status, body.error?.message);
    process.exit(1);
  }
  const menu = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Menu!A:A`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  console.log("OK:", body.properties.title, "| tabs:", body.sheets.map((s: any) => s.properties.title).join(", "), "| menu rows:", (menu.values?.length ?? 1) - 1);
}
main().catch((e) => { console.log("FAILED", e.message); process.exit(1); });
