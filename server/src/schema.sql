-- WasteWise PostgreSQL Schema
-- Idempotent: safe to run on every startup

CREATE TABLE IF NOT EXISTS roles (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
INSERT INTO roles (name) VALUES ('user'), ('company'), ('admin')
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS recycling_companies (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  wallet_address TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  email                 TEXT UNIQUE NOT NULL,
  password_hash         TEXT NOT NULL,
  role_id               INTEGER REFERENCES roles(id) DEFAULT 1,
  wallet_address        TEXT,
  is_assisted_collector BOOLEAN DEFAULT FALSE,
  collector_code        TEXT,
  center_id             INTEGER REFERENCES recycling_companies(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plastic_submissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES users(id) ON DELETE CASCADE,
  image_url                TEXT,
  latitude                 NUMERIC(9,6),
  longitude                NUMERIC(9,6),
  reported_weight_kg       NUMERIC(8,3) CHECK (reported_weight_kg > 0 AND reported_weight_kg <= 10000),
  waste_type               TEXT,
  verification_status      TEXT DEFAULT 'PENDING'
                             CHECK (verification_status IN ('PENDING','APPROVED','REJECTED')),
  weight_validation_status TEXT DEFAULT 'PENDING'
                             CHECK (weight_validation_status IN ('PENDING','VALIDATED','REJECTED')),
  submission_hash          TEXT,
  center_id                INTEGER REFERENCES recycling_companies(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID UNIQUE REFERENCES plastic_submissions(id) ON DELETE CASCADE,
  verification_result   TEXT CHECK (verification_result IN (
                          'APPROVED','REJECTED_SPOOF','REJECTED_LOW_QUALITY','REJECTED_INVALID_MATERIAL'
                        )),
  primary_category      TEXT,
  detected_items_count  INTEGER DEFAULT 0 CHECK (detected_items_count >= 0),
  confidence_score      NUMERIC(5,4) DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  authenticity_verified BOOLEAN DEFAULT FALSE,
  fraud_flags           JSONB DEFAULT '[]'::jsonb,
  model_version         TEXT,
  verified_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rewards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  submission_id    UUID REFERENCES plastic_submissions(id) ON DELETE CASCADE,
  token_amount     NUMERIC(18,6) DEFAULT 0 CHECK (token_amount >= 0),
  immediate_amount NUMERIC(18,6) DEFAULT 0 CHECK (immediate_amount >= 0),
  pending_amount   NUMERIC(18,6) DEFAULT 0 CHECK (pending_amount >= 0),
  status           TEXT DEFAULT 'PARTIAL' CHECK (status IN ('PARTIAL','RELEASED','FAILED')),
  tx_hash          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS optimized_routes (
  id                  SERIAL PRIMARY KEY,
  zone                TEXT,
  route_order         JSONB,
  total_distance_km   NUMERIC(8,2) CHECK (total_distance_km >= 0),
  algorithm_used      TEXT,
  improvement_percent NUMERIC(6,2),
  generated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Idempotent constraint additions (for tables that may pre-date this schema) ─

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_center_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_center_id_fkey
      FOREIGN KEY (center_id) REFERENCES recycling_companies(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plastic_submissions_center_id_fkey'
  ) THEN
    ALTER TABLE plastic_submissions
      ADD CONSTRAINT plastic_submissions_center_id_fkey
      FOREIGN KEY (center_id) REFERENCES recycling_companies(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rewards_submission_id_fkey'
  ) THEN
    ALTER TABLE rewards
      ADD CONSTRAINT rewards_submission_id_fkey
      FOREIGN KEY (submission_id) REFERENCES plastic_submissions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add updated_at columns if they don't exist yet (older schema versions omitted them)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='plastic_submissions' AND column_name='updated_at'
  ) THEN
    ALTER TABLE plastic_submissions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='rewards' AND column_name='updated_at'
  ) THEN
    ALTER TABLE rewards ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ── Indices ────────────────────────────────────────────────────────────────────

-- Users: lookups by email (auth) and role
CREATE INDEX IF NOT EXISTS idx_users_email   ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users (role_id);

-- Submissions: most queries filter/sort by user, status, and time
CREATE INDEX IF NOT EXISTS idx_submissions_user_id   ON plastic_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status    ON plastic_submissions (verification_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created   ON plastic_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_center_id ON plastic_submissions (center_id);
-- Heatmap queries filter by status then use lat/lng
CREATE INDEX IF NOT EXISTS idx_submissions_status_geo
  ON plastic_submissions (verification_status, latitude, longitude);

-- Rewards: per-user listing and submission lookup
CREATE INDEX IF NOT EXISTS idx_rewards_user_id      ON rewards (user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_submission   ON rewards (submission_id);
CREATE INDEX IF NOT EXISTS idx_rewards_status       ON rewards (status);
CREATE INDEX IF NOT EXISTS idx_rewards_created      ON rewards (created_at DESC);

-- Verification: looked up by submission_id constantly
CREATE INDEX IF NOT EXISTS idx_verification_submission ON verification (submission_id);

-- Routes: latest-first queries, optionally filtered by zone
CREATE INDEX IF NOT EXISTS idx_routes_generated ON optimized_routes (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_routes_zone      ON optimized_routes (zone);

-- ── Auto-update updated_at trigger ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_submissions_updated_at'
  ) THEN
    CREATE TRIGGER trg_submissions_updated_at
      BEFORE UPDATE ON plastic_submissions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rewards_updated_at'
  ) THEN
    CREATE TRIGGER trg_rewards_updated_at
      BEFORE UPDATE ON rewards
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
