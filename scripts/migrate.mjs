// Applies supabase/migrations/*.sql in order against the database in DATABASE_URL (from .env).
// Every migration is safe to re-run. Usage:  npm run migrate
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env (Supabase → Project Settings → Database → Connection string, URI).");
  process.exit(1);
}

const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
let failed = false;
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`✓ ${f}`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error(`✗ ${f}: ${e.message}`);
    failed = true;
    break;
  }
}
await client.end();
process.exit(failed ? 1 : 0);
