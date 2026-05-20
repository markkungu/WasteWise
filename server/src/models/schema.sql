-- =============================================================================
-- WasteWise PostgreSQL Schema
-- =============================================================================
-- Run with: psql -d wastewise -f schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- Seed default roles
INSERT INTO roles (name) VALUES ('user'), ('company'), ('admin')
    ON CONFLICT (name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                VARCHAR(255) UNIQUE NOT NULL,
    password_hash        TEXT NOT NULL,
    name                 VARCHAR(255) NOT NULL,
    role_id              INTEGER NOT NULL REFERENCES roles(id) DEFAULT 1,
    wallet_address       VARCHAR(42),                -- Ethereum address (0x…)
    is_assisted_collector BOOLEAN NOT NULL DEFAULT FALSE,
    collector_code       VARCHAR(50) UNIQUE,         -- code issued to assisted collectors
    center_id            INTEGER,                    -- associated recycling centre
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id   ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_center_id ON users(center_id);


-- ---------------------------------------------------------------------------
-- 3. Wallets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address      VARCHAR(42) NOT NULL,
    is_custodial BOOLEAN NOT NULL DEFAULT TRUE,   -- TRUE = managed by the platform
    center_id    INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, address)
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);


-- ---------------------------------------------------------------------------
-- 4. Plastic Submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plastic_submissions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url                TEXT NOT NULL,
    latitude                 DOUBLE PRECISION,
    longitude                DOUBLE PRECISION,
    reported_weight_kg       NUMERIC(8, 3),
    waste_type               VARCHAR(50),               -- PET, HDPE, LDPE, PP, PS
    verification_status      VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                                 -- PENDING | APPROVED | REJECTED_SPOOF |
                                 -- REJECTED_INVALID_MATERIAL | REJECTED_LOW_QUALITY
    weight_validation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    submission_hash          VARCHAR(66),               -- keccak256 of image for dedup
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_user_id           ON plastic_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_verification      ON plastic_submissions(verification_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at        ON plastic_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_geo               ON plastic_submissions(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_submissions_submission_hash   ON plastic_submissions(submission_hash);


-- ---------------------------------------------------------------------------
-- 5. Verification
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   UUID NOT NULL REFERENCES plastic_submissions(id) ON DELETE CASCADE,
    verified_by     VARCHAR(100) NOT NULL,     -- 'AI', 'MANUAL', etc.
    method_used     VARCHAR(100) NOT NULL,     -- 'YOLO_V8', 'HUMAN_REVIEW', etc.
    result          VARCHAR(50) NOT NULL,
                        -- APPROVED | REJECTED_SPOOF |
                        -- REJECTED_INVALID_MATERIAL | REJECTED_LOW_QUALITY
    confidence_score NUMERIC(5, 4),            -- 0.0000 – 1.0000
    fraud_flags     JSONB NOT NULL DEFAULT '[]',
    model_version   VARCHAR(50),
    verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (submission_id)                     -- one verification record per submission
);

CREATE INDEX IF NOT EXISTS idx_verification_submission_id ON verification(submission_id);
CREATE INDEX IF NOT EXISTS idx_verification_result        ON verification(result);


-- ---------------------------------------------------------------------------
-- 6. Rewards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rewards (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_id    UUID REFERENCES plastic_submissions(id) ON DELETE SET NULL,
    token_amount     NUMERIC(18, 6) NOT NULL DEFAULT 0,   -- total earned
    immediate_amount NUMERIC(18, 6) NOT NULL DEFAULT 0,   -- 70 % issued immediately
    pending_amount   NUMERIC(18, 6) NOT NULL DEFAULT 0,   -- 30 % pending co-sign
    status           VARCHAR(20) NOT NULL DEFAULT 'PARTIAL',
                         -- PARTIAL | COMPLETED | FAILED
    tx_hash          VARCHAR(66),                          -- blockchain tx hash
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewards_user_id       ON rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_submission_id ON rewards(submission_id);
CREATE INDEX IF NOT EXISTS idx_rewards_status        ON rewards(status);
CREATE INDEX IF NOT EXISTS idx_rewards_created_at    ON rewards(created_at DESC);


-- ---------------------------------------------------------------------------
-- 7. Recycling Companies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recycling_companies (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    center_id      INTEGER UNIQUE,
    is_authorized  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_wallet_address ON recycling_companies(wallet_address);
CREATE INDEX IF NOT EXISTS idx_companies_center_id      ON recycling_companies(center_id);


-- ---------------------------------------------------------------------------
-- 8. Optimised Routes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS optimized_routes (
    id                  SERIAL PRIMARY KEY,
    zone                VARCHAR(100),              -- neighbourhood / zone name
    route_order         JSONB NOT NULL DEFAULT '[]', -- ordered list of stop IDs / coordinates
    total_distance_km   NUMERIC(10, 3),
    algorithm_used      VARCHAR(100) NOT NULL DEFAULT 'quantum_annealing',
    improvement_percent NUMERIC(5, 2),             -- vs. previous route (0-100)
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_zone         ON optimized_routes(zone);
CREATE INDEX IF NOT EXISTS idx_routes_generated_at ON optimized_routes(generated_at DESC);
