-- ============================================================================
-- Time Detectives — D1 schema
-- ============================================================================
-- Run this ONCE against a fresh D1 database before your first deploy (or
-- against your new database as part of migrating off Workers KV — see
-- migrate-kv-to-d1.mjs and the README's "Migrating from KV" section).
--
--   wrangler d1 execute time-detectives-db --remote --file=schema.sql
--
-- (drop --remote to apply it to your local dev database instead, e.g. while
-- testing with `wrangler pages dev`.)
--
-- This mirrors the old KV key layout:
--   KV `player:<email>`      -> row in `players`
--   KV `playername:<name>`   -> the `detective_name_key` column on `players`
--                                (was a separate lookup key in KV; D1 can
--                                just index it, so there's no second table)
--   KV `teacher:<username>`  -> row in `teachers`
--   KV `settings:global`     -> the single row in `settings`
-- ============================================================================

CREATE TABLE IF NOT EXISTS players (
  email               TEXT PRIMARY KEY,       -- normalized lowercase email; the account's real identity
  detective_name      TEXT NOT NULL,          -- display name, original casing
  detective_name_key  TEXT NOT NULL UNIQUE,   -- lowercase detective_name, used for name-based sign-in lookups
  salt                TEXT NOT NULL,          -- PBKDF2 salt, base64url
  hash                TEXT NOT NULL,          -- PBKDF2 hash, base64url
  is_guest            INTEGER NOT NULL DEFAULT 0,  -- always 0 in practice; guests never reach the server
  points               INTEGER NOT NULL DEFAULT 0,  -- own column so the leaderboard/roster can sort/filter cheaply
  data                TEXT NOT NULL DEFAULT '{}',  -- JSON blob: progress, trophies, outcomesSeen,
                                                     -- completionistBadges, contentMastery, atlasUnlocked,
                                                     -- checkpointsCompleted, cosmetics
  updated_at          INTEGER NOT NULL             -- epoch ms, same meaning as the old KV record's updatedAt
);

-- Every sign-in-by-name lookup (routePlayerLogin) filters on this, and the
-- signup uniqueness check does too — index it so both stay fast as the
-- roster grows across terms.
CREATE INDEX IF NOT EXISTS idx_players_name_key ON players(detective_name_key);

CREATE TABLE IF NOT EXISTS teachers (
  username      TEXT PRIMARY KEY,       -- display name, original casing
  username_key  TEXT NOT NULL UNIQUE,   -- lowercase, used for sign-in lookups
  salt          TEXT NOT NULL,
  hash          TEXT NOT NULL
);

-- Single-row table holding the class-wide settings JSON blob (allowRetry,
-- showHints, timeLimitMinutes, assignedCaseIds). The CHECK pins it to one
-- row so "the current settings" is always an unambiguous single SELECT.
CREATE TABLE IF NOT EXISTS settings (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  data  TEXT NOT NULL
);

-- One row per "legacy" illustration a teacher has supplied — either the
-- single artifact tied to a case (legacy_id like "case3-trophy") or one of
-- the civilisation-wide legacies shown in that case's Legacy Briefing/Atlas
-- entry (legacy_id like "case3-legacy0", "case3-legacy1", ...). See the
-- LEGACY_ID CONVENTION comment in functions/api/[[path]].js for how these
-- ids are generated client-side — this table doesn't enforce which ids are
-- "real", it just stores whatever a teacher has attached art to.
--
-- Exactly one of (url, image_data) is populated, matching `kind`. Pupils
-- read this table (GET /api/legacy-illustrations, no auth) so their client
-- can show real artwork instead of the placeholder box; only signed-in
-- teachers can write to it.
CREATE TABLE IF NOT EXISTS legacy_illustrations (
  legacy_id   TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,   -- 'url' | 'upload'
  url         TEXT,            -- set when kind = 'url'
  image_data  TEXT,            -- set when kind = 'upload' (a data: URI, base64-encoded)
  alt_text    TEXT,
  updated_by  TEXT,            -- teacher/admin username who last set this, for reference
  updated_at  INTEGER NOT NULL
);

-- ============================================================================
-- v3: Archivist + practice quiz (Workers AI)
-- Safe to run on an existing database: every statement is IF NOT EXISTS.
--   wrangler d1 execute time-detectives-db --remote --file=schema.sql
-- ============================================================================

-- Per-pupil daily request counter (the admin sets the daily limit in the dashboard).
-- `day` is a YYYY-MM-DD string in the school's timezone (see AI_DAY_OFFSET_HOURS in the README).
CREATE TABLE IF NOT EXISTS ai_usage (
  email  TEXT NOT NULL,
  day    TEXT NOT NULL,
  used   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, day)
);

-- Site-wide daily request counter, so one busy day can't run up the AI bill.
CREATE TABLE IF NOT EXISTS ai_global (
  day    TEXT PRIMARY KEY,
  calls  INTEGER NOT NULL DEFAULT 0
);

-- Every question a pupil asks and every answer given, for teachers to review.
-- The API keeps only the most recent 500 rows; an admin can also clear it from the dashboard.
CREATE TABLE IF NOT EXISTS ai_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              INTEGER NOT NULL,          -- epoch ms
  email           TEXT NOT NULL,
  detective_name  TEXT NOT NULL DEFAULT '',
  case_id         INTEGER NOT NULL,
  kind            TEXT NOT NULL,             -- 'ask' | 'quiz'
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  blocked         INTEGER NOT NULL DEFAULT 0, -- 1 = refused before reaching the model
  flagged         INTEGER NOT NULL DEFAULT 0  -- 1 = the pupil reported this answer
);
