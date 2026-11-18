/** Writes supabase/schema.sql from src/lib/data/schema.ts:  npm run supabase:sql */
import { writeFileSync } from "node:fs";
import { supabaseSchemaSql } from "../src/lib/data/supabaseSql";

writeFileSync("supabase/schema.sql", supabaseSchemaSql());
console.log("Wrote supabase/schema.sql – paste it into Supabase > SQL Editor and click Run.");
