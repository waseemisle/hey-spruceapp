-- Run this once in the Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/uokmehjqcxmcoavnszid/sql/new

-- 1. Create the main backup table
CREATE TABLE IF NOT EXISTS firestore_backup (
  collection_name TEXT NOT NULL,
  doc_id          TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_name, doc_id)
);

-- 2. Index for fast collection lookups
CREATE INDEX IF NOT EXISTS idx_fb_collection
  ON firestore_backup (collection_name);

-- 3. Index for querying recently synced records
CREATE INDEX IF NOT EXISTS idx_fb_synced_at
  ON firestore_backup (synced_at DESC);

-- 4. Index for JSONB searches (e.g. find all docs where data->>'status' = 'active')
CREATE INDEX IF NOT EXISTS idx_fb_data_gin
  ON firestore_backup USING gin (data);

-- 5. Create a sync_log table to track each daily sync run
CREATE TABLE IF NOT EXISTS sync_log (
  id           BIGSERIAL PRIMARY KEY,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_synced INT NOT NULL DEFAULT 0,
  total_errors INT NOT NULL DEFAULT 0,
  results      JSONB NOT NULL DEFAULT '{}'
);
