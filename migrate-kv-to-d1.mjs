#!/usr/bin/env node
// ============================================================================
// Time Detectives — migrate Workers KV data into D1
// ============================================================================
// One-time migration script. Reads every existing player/teacher/settings
// record out of your OLD Workers KV namespace and writes a plain SQL file
// you load into your NEW D1 database with `wrangler d1 execute`.
//
// This is READ-ONLY against KV and does not touch D1 directly — it only
// *generates* a .sql file, so you (or anyone) can read exactly what it's
// about to do before anything is written to your real database.
//
// Requirements:
//   - Node.js 18+
//   - `wrangler` installed and logged in (`wrangler login`), with access to
//     the Cloudflare account that owns the KV namespace
//
// Usage:
//   node migrate-kv-to-d1.mjs --kv-namespace-id=<id> [--out=migration-data.sql]
//
// Where to find --kv-namespace-id:
//   - It's the `id` value under [[kv_namespaces]] in your OLD (KV-based)
//     wrangler.toml, e.g.:
//       [[kv_namespaces]]
//       binding = "TD_KV"
//       id = "a1b2c3d4e5f6..."   <- this value
//   - Or run: wrangler kv namespace list
//     and find the one bound as TD_KV for the time-detectives project.
//
// Full migration order (see README.md "Migrating from KV to D1" for the
// narrative walkthrough — this is the short version):
//   1. Pick a moment pupils are NOT actively playing. This script takes a
//      SNAPSHOT — anything saved to KV after it runs and before you deploy
//      the D1 version will not carry over. A lunch break or after school is
//      plenty; you do not need to warn a whole term in advance.
//   2. wrangler d1 create time-detectives-db          (if you haven't already)
//   3. wrangler d1 execute time-detectives-db --remote --file=schema.sql
//   4. node migrate-kv-to-d1.mjs --kv-namespace-id=<id>
//   5. Skim the generated migration-data.sql — it's plain, readable SQL.
//   6. wrangler d1 execute time-detectives-db --remote --file=migration-data.sql
//   7. Spot-check a few rows (see the command this script prints at the end).
//   8. Deploy this D1-based package: wrangler pages deploy .
//
// Note on wrangler versions: the exact flags for `kv key list` / `kv key
// get` have shifted slightly across major Wrangler releases (some older
// versions use `wrangler kv:key list` with a colon). If a command below
// errors with "unknown command", run `wrangler kv --help` to see the exact
// subcommand names for the version you have installed, and adjust the two
// runWrangler() calls near the top of this file accordingly.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const namespaceId = arg('kv-namespace-id');
const outFile = arg('out', 'migration-data.sql');
const delayMs = Number(arg('delay-ms', '50')); // gentle pacing between per-key `wrangler kv key get` calls

if (!namespaceId) {
  console.error('Missing required --kv-namespace-id=<id>.');
  console.error('See the comment block at the top of this file for how to find it.');
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function sqlInt(value) { return Number.isFinite(value) ? String(Math.trunc(value)) : '0'; }

function runWrangler(args) {
  return execFileSync('wrangler', args, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 64 });
}

function listAllKeys() {
  console.log('Listing keys in KV namespace', namespaceId, '...');
  const out = runWrangler(['kv', 'key', 'list', '--namespace-id', namespaceId, '--remote']);
  const keys = JSON.parse(out);
  console.log(`Found ${keys.length} key(s).`);
  return keys.map(k => k.name);
}

function getValue(key) {
  // --text prints the raw value with no extra formatting/quoting.
  return runWrangler(['kv', 'key', 'get', key, '--namespace-id', namespaceId, '--remote', '--text']);
}

async function main() {
  const keys = listAllKeys();

  const playerStatements = [];
  const teacherStatements = [];
  const settingsStatements = [];
  let skipped = 0;

  for (const key of keys) {
    await sleep(delayMs);
    let raw;
    try {
      raw = getValue(key);
    } catch (e) {
      console.warn(`Could not read key "${key}", skipping:`, e.message);
      skipped++;
      continue;
    }

    if (key.startsWith('player:')) {
      let rec;
      try { rec = JSON.parse(raw); } catch (e) { console.warn(`Bad JSON for ${key}, skipping`); skipped++; continue; }
      if (rec.isGuest) { skipped++; continue; } // guests never had server records to begin with, skip defensively
      const { email, detectiveName, salt, hash, isGuest, points, updatedAt, ...rest } = rec;
      const emailNorm = String(email || '').trim().toLowerCase();
      const nameKey = String(detectiveName || '').trim().toLowerCase();
      playerStatements.push(
        `INSERT INTO players (email, detective_name, detective_name_key, salt, hash, is_guest, points, data, updated_at) VALUES (` +
        `${sqlString(emailNorm)}, ${sqlString(detectiveName)}, ${sqlString(nameKey)}, ${sqlString(salt)}, ${sqlString(hash)}, 0, ` +
        `${sqlInt(points || 0)}, ${sqlString(JSON.stringify(rest))}, ${sqlInt(updatedAt || Date.now())}) ` +
        `ON CONFLICT(email) DO UPDATE SET detective_name=excluded.detective_name, detective_name_key=excluded.detective_name_key, ` +
        `salt=excluded.salt, hash=excluded.hash, points=excluded.points, data=excluded.data, updated_at=excluded.updated_at;`
      );
    } else if (key.startsWith('playername:')) {
      // No equivalent row needed: detective_name_key lives on the player
      // row itself and is indexed in D1, replacing this separate KV lookup key.
      continue;
    } else if (key.startsWith('teacher:')) {
      let rec;
      try { rec = JSON.parse(raw); } catch (e) { console.warn(`Bad JSON for ${key}, skipping`); skipped++; continue; }
      const usernameKey = String(rec.username || '').trim().toLowerCase();
      teacherStatements.push(
        `INSERT INTO teachers (username, username_key, salt, hash) VALUES (` +
        `${sqlString(rec.username)}, ${sqlString(usernameKey)}, ${sqlString(rec.salt)}, ${sqlString(rec.hash)}) ` +
        `ON CONFLICT(username) DO UPDATE SET username_key=excluded.username_key, salt=excluded.salt, hash=excluded.hash;`
      );
    } else if (key === 'settings:global') {
      settingsStatements.push(
        `INSERT INTO settings (id, data) VALUES (1, ${sqlString(raw)}) ON CONFLICT(id) DO UPDATE SET data=excluded.data;`
      );
    } else {
      skipped++;
    }
  }

  const lines = [
    '-- Generated by migrate-kv-to-d1.mjs — read this before running it against your real D1 database.',
    `-- Source KV namespace: ${namespaceId}`,
    `-- Generated: ${new Date().toISOString()}`,
    '',
    `-- Players (${playerStatements.length})`,
    ...playerStatements,
    '',
    `-- Teachers (${teacherStatements.length})`,
    ...teacherStatements,
    '',
    `-- Settings (${settingsStatements.length})`,
    ...settingsStatements,
    ''
  ];
  writeFileSync(outFile, lines.join('\n'), 'utf-8');

  console.log('');
  console.log(`Wrote ${playerStatements.length} player row(s), ${teacherStatements.length} teacher row(s), ${settingsStatements.length} settings row(s) to ${outFile}.`);
  if (skipped) console.log(`Skipped ${skipped} guest/unrecognized/unreadable key(s) (expected — see comments above).`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Open the file and skim it — it is plain, readable SQL.');
  console.log(`  2. wrangler d1 execute <your-d1-db-name> --remote --file=${outFile}`);
  console.log('  3. Spot-check it landed:');
  console.log('     wrangler d1 execute <your-d1-db-name> --remote --command="SELECT detective_name, email, points FROM players;"');
}

main().catch(e => { console.error(e); process.exit(1); });
