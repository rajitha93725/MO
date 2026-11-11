// Copies the 3 secrets from .env.local into Firebase App Hosting (Cloud Secret Manager).
// Values are passed via temporary files that are deleted afterwards; nothing is printed.
//
//   node scripts/set-firebase-secrets.mjs            -> create/update the secrets
//   node scripts/set-firebase-secrets.mjs mo-ops     -> also grant access to the backend named "mo-ops"
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const PROJECT = "mo-villa-and-cafe";
const backend = process.argv[2];
const env = readFileSync(".env.local", "utf8");
// Supports KEY=value, KEY="value" and KEY="multi-line value" (as the private key is usually stored).
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(?:"([\\s\\S]*?)"|'([\\s\\S]*?)'|(.*))\\s*$`, "m"));
  const v = m && (m[1] ?? m[2] ?? m[3] ?? "").replace(/\r/g, "").trim();
  if (!v) throw new Error(`${k} is missing in .env.local`);
  return v;
};

const privateKey = get("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----") || privateKey.length < 1000) {
  throw new Error("GOOGLE_PRIVATE_KEY in .env.local does not look like a full private key (BEGIN…END). Nothing was uploaded.");
}

const secrets = {
  "mo-google-private-key": privateKey,
  "mo-google-client-secret": get("GOOGLE_CLIENT_SECRET"),
  "mo-nextauth-secret": get("NEXTAUTH_SECRET"),
};

const dir = mkdtempSync(join(tmpdir(), "mo-secrets-"));
const firebase = process.platform === "win32" ? "firebase.cmd" : "firebase";
try {
  for (const [name, value] of Object.entries(secrets)) {
    const file = join(dir, name);
    writeFileSync(file, value, { mode: 0o600 });
    console.log(`Setting ${name} …`);
    execFileSync(firebase, ["apphosting:secrets:set", name, "--data-file", file, "--project", PROJECT], { stdio: ["inherit", "inherit", "inherit"], shell: process.platform === "win32" });
  }
  if (backend) {
    console.log(`Granting backend "${backend}" access …`);
    execFileSync(firebase, ["apphosting:secrets:grantaccess", Object.keys(secrets).join(","), "--backend", backend, "--project", PROJECT], { stdio: "inherit", shell: process.platform === "win32" });
  }
  console.log("Done.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
