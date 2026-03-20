-- Run this ONCE in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/uokmehjqcxmcoavnszid/sql/new

-- ─────────────────────────────────────────────────────────────────────
-- 1. Main Firestore backup table (one row per document)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS firestore_backup (
  collection_name TEXT        NOT NULL,
  doc_id          TEXT        NOT NULL,
  data            JSONB       NOT NULL DEFAULT '{}',
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_name, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_collection ON firestore_backup (collection_name);
CREATE INDEX IF NOT EXISTS idx_fb_synced_at  ON firestore_backup (synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_data_gin   ON firestore_backup USING gin (data);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Firebase Auth users table (clients + subcontractors + admins)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS firebase_auth_users (
  uid             TEXT        NOT NULL PRIMARY KEY,
  role            TEXT        NOT NULL,           -- 'client' | 'subcontractor' | 'admin'
  email           TEXT,
  full_name       TEXT,
  phone           TEXT,
  company_name    TEXT,
  status          TEXT,                           -- 'pending' | 'approved' | 'rejected'
  password_plain  TEXT,                           -- plaintext stored in Firestore for admin view
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  disabled        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at_auth TIMESTAMPTZ,                    -- Firebase Auth account creation time
  last_sign_in    TIMESTAMPTZ,                    -- last Firebase Auth sign-in
  provider_data   JSONB       NOT NULL DEFAULT '[]',
  firestore_data  JSONB       NOT NULL DEFAULT '{}', -- full Firestore document
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_email    ON firebase_auth_users (email);
CREATE INDEX IF NOT EXISTS idx_auth_role     ON firebase_auth_users (role);
CREATE INDEX IF NOT EXISTS idx_auth_status   ON firebase_auth_users (status);
CREATE INDEX IF NOT EXISTS idx_auth_sync     ON firebase_auth_users (synced_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 3. Sync run log
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id           BIGSERIAL   PRIMARY KEY,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_synced INT         NOT NULL DEFAULT 0,
  total_errors INT         NOT NULL DEFAULT 0,
  results      JSONB       NOT NULL DEFAULT '{}'
);
