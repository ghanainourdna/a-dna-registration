#!/usr/bin/env node
/**
 * Apply supabase/apply-payment-schema-gap.sql to the linked Supabase Postgres database.
 *
 * Requires in .env.local (or env):
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_DB_PASSWORD=...   (Settings → Database → database password)
 *
 * Optional: SUPABASE_DB_HOST=db.xxxx.supabase.co (default derived from project ref)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv(path.join(root, '.env.local')), ...process.env };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const password = env.SUPABASE_DB_PASSWORD?.trim();

if (!supabaseUrl || !password) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_DB_PASSWORD.\n' +
      'Add your database password from Supabase → Settings → Database to .env.local as SUPABASE_DB_PASSWORD.',
  );
  process.exit(1);
}

const ref = new URL(supabaseUrl).hostname.split('.')[0];
const host = env.SUPABASE_DB_HOST?.trim() || `db.${ref}.supabase.co`;
const connectionString =
  env.SUPABASE_DB_URL?.trim() ||
  `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/postgres`;

const sqlPath = path.join(root, 'supabase/apply-payment-schema-gap.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

console.log(`Connecting to ${host}…`);
await client.connect();
try {
  await client.query(sql);
  console.log('Applied payment schema gap SQL successfully.');
} finally {
  await client.end();
}
