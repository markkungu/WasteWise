-- WasteWise PostgreSQL Schema
-- Idempotent: safe to run on every startup

CREATE TABLE IF NOT EXISTS roles (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
INSERT INTO roles (name) VALUES ('user'), ('company'), ('admin')
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  email                 TEXT UNIQUE NOT NULL,
  password_hash         TEXT NOT NULL,
  role_id               INTEGER REFERENCES roles(id) DEFAULT 1,
  wallet_address        TEXT,
  is_assisted_collector BOOLEAN DEFAULT FALSE,
  collector_code        TEXT,
  center_id             INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plastic_submissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES users(id) ON DELETE CASCADE,
  image_url                TEXT,
  latitude                 NUMERIC(9,6),
  longitude                NUMERIC(9,6),
  reported_weight_kg       NUMERIC(8,3),
  waste_type               TEXT,
  verification_status      TEXT DEFAULT 'PENDING',
  weight_validation_status TEXT DEFAULT 'PENDING',
  submission_hash          TEXT,
  center_id                INTEGER,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID UNIQUE REFERENCES plastic_submissions(id) ON DELETE CASCADE,
  verification_result   TEXT,
  primary_category      TEXT,
  detected_items_count  INTEGER DEFAULT 0,
  confidence_score      NUMERIC(5,4) DEFAULT 0,
  authenticity_verified BOOLEAN DEFAULT FALSE,
  fraud_flags           JSONB DEFAULT '[]'::jsonb,
  model_version         TEXT,
  verified_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rewards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  submission_id    UUID,
  token_amount     NUMERIC(18,6) DEFAULT 0,
  immediate_amount NUMERIC(18,6) DEFAULT 0,
  pending_amount   NUMERIC(18,6) DEFAULT 0,
  status           TEXT DEFAULT 'PARTIAL',
  tx_hash          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recycling_companies (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  wallet_address TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS optimized_routes (
  id                  SERIAL PRIMARY KEY,
  zone                TEXT,
  route_order         JSONB,
  total_distance_km   NUMERIC(8,2),
  algorithm_used      TEXT,
  improvement_percent NUMERIC(6,2),
  generated_at        TIMESTAMPTZ DEFAULT NOW()
);
