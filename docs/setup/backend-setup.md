# Backend — Setup Guide

**Module location:** `server/`
**Port:** 5000

---

## What This Module Does

The Node.js/Express backend is the central coordinator for the entire WasteWise system. Every request from the mobile app flows through here. The backend:

- **Authenticates users** using JWT (bcryptjs password hashing at cost 12, 7-day token expiry). Roles: `user`, `company`, `admin`.
- **Stores all data** in PostgreSQL: users, submissions, verification results, rewards, routes, and company records.
- **Calls the AI verification service** (port 8001) with each new submission's image URL and metadata.
- **Calls the smart contracts** via ethers.js v6 to mint WWT tokens on Ethereum Sepolia when a submission is approved.
- **Calls the quantum optimization service** (port 8002) when an admin triggers a route optimization run.
- **Serves analytics** (heatmaps, submission trends, reward totals) to the admin dashboard.

The frontend never calls the AI service, quantum service, or Ethereum directly — all integration goes through this backend.

### Key source files

| File | Purpose |
|------|---------|
| `index.js` | Entry point — creates Express app, attaches middleware, mounts routes, starts server |
| `src/config/database.js` | PostgreSQL connection pool (node-postgres) |
| `src/config/blockchain.js` | ethers.js provider, signer wallet, contract instances |
| `src/middleware/auth.js` | JWT verification middleware |
| `src/middleware/rateLimiter.js` | express-rate-limit configs (strict for auth, moderate for submissions) |
| `src/models/schema.sql` | Full PostgreSQL schema — run once to create all tables |
| `src/controllers/auth.js` | Register, login, profile |
| `src/controllers/submission.js` | Create submission → call AI → call blockchain |
| `src/controllers/reward.js` | List rewards, release final reward, batch claim |
| `src/controllers/route.js` | Get latest routes, trigger optimization |
| `src/controllers/analytics.js` | Dashboard stats, heatmap data, trends |
| `src/routes/` | Express routers that wire controllers to URL paths |

---

## Prerequisites

- Node.js 20 LTS or newer
- npm 9 or newer
- PostgreSQL 14 or newer installed and running
- AI verification service running on port 8001 (or backend will queue submissions as PENDING)
- Smart contracts deployed and addresses noted (see [blockchain-setup.md](blockchain-setup.md))

---

## Setup Steps

### 1. Create the PostgreSQL database

Connect to PostgreSQL as a superuser:

```bash
psql -U postgres
```

Run these commands inside psql:

```sql
CREATE DATABASE wastewise;
CREATE USER wastewise_user WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE wastewise TO wastewise_user;
\q
```

Replace `yourpassword` with a secure password you will remember. It goes in your `.env` next.

### 2. Install Node.js dependencies

```bash
cd server
npm install
```

### 3. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in every value:

```env
# Server
PORT=5000

# PostgreSQL
DB_URL=postgresql://wastewise_user:yourpassword@localhost:5432/wastewise

# Authentication
JWT_SECRET=replace_this_with_a_random_32_character_string
JWT_EXPIRES_IN=7d

# Blockchain (Sepolia testnet)
BLOCKCHAIN_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=your_deployer_wallet_private_key_without_0x_prefix
WASTE_TOKEN_ADDRESS=0x_from_blockchain_deploy
REWARD_DISTRIBUTOR_ADDRESS=0x_from_blockchain_deploy

# Internal services
ML_SERVICE_URL=http://localhost:8001
OPTIMIZATION_SERVICE_URL=http://localhost:8002

# CORS (for web dashboard)
CORS_ORIGIN=http://localhost:3000
```

**Variable-by-variable guide:**

| Variable | What it is | Where to get it |
|----------|-----------|-----------------|
| `DB_URL` | PostgreSQL connection string | Use the database/user/password you just created |
| `JWT_SECRET` | Secret for signing JWTs | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BLOCKCHAIN_RPC` | Ethereum Sepolia JSON-RPC endpoint | Alchemy or Infura free tier — copy the HTTPS URL |
| `PRIVATE_KEY` | Wallet private key that pays gas and is the authorized verifier | MetaMask → Account Details → Export Private Key (without `0x` prefix) |
| `WASTE_TOKEN_ADDRESS` | Deployed WasteToken contract address | Printed by `scripts/deploy.js` after deploying |
| `REWARD_DISTRIBUTOR_ADDRESS` | Deployed RewardDistributor contract address | Printed by `scripts/deploy.js` after deploying |
| `ML_SERVICE_URL` | Base URL of the AI service | `http://localhost:8001` for local dev |
| `OPTIMIZATION_SERVICE_URL` | Base URL of the quantum service | `http://localhost:8002` for local dev |

### 4. Load the database schema

Run the schema SQL file to create all tables:

```bash
psql -U wastewise_user -d wastewise -f src/models/schema.sql
```

Expected output: a series of `CREATE TABLE` and `CREATE INDEX` messages with no errors.

### 5. Start the server

Development mode (auto-restarts on file changes with nodemon):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server prints `WasteWise backend running on port 5000` when ready.

---

## Verifying the Server is Running

### Health check

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "wastewise-api",
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

### Register a test user

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "wallet_address": "0x0000000000000000000000000000000000000001"
  }'
```

Expected response: HTTP 201 with a JWT token and user object.

---

## API Base URL

All endpoints are under: `http://localhost:5000/api`

Protected endpoints require the header: `Authorization: Bearer <JWT>`

Key endpoint groups:
- `POST /api/auth/register` — create account
- `POST /api/auth/login` — get JWT
- `GET /api/auth/profile` — get current user
- `POST /api/submissions` — submit plastic photo for verification
- `GET /api/submissions` — list your submissions
- `GET /api/rewards` — list your rewards
- `POST /api/rewards/release` — release 30% (company/admin only)
- `POST /api/rewards/batch-claim` — batch reward for assisted collectors
- `GET /api/routes/latest` — get optimized collection routes
- `POST /api/routes/optimize` — trigger route optimization (admin only)
- `GET /api/analytics/dashboard` — admin/company dashboard stats

Full documentation: [docs/api-schema.md](../api-schema.md)

---

## Startup Dependencies

The backend is resilient to missing downstream services:

| Service | Effect if offline at startup |
|---------|------------------------------|
| PostgreSQL | Backend fails to start — DB is required |
| AI service (8001) | Backend starts fine. New submissions return HTTP 202 PENDING instead of a verification result. |
| Quantum service (8002) | Backend starts fine. Route optimization requests return an error to the caller. |
| Ethereum/Sepolia | Backend starts fine. Blockchain calls fail at transaction time and return HTTP 502 to the client. |

This means you can run and test the backend's auth and submission storage logic without the Python services running. Blockchain calls only happen after AI approval, so no contract calls are attempted if the AI is down.

---

## Common Errors and Fixes

| Error message | Cause | Fix |
|--------------|-------|-----|
| `password authentication failed for user "wastewise_user"` | Wrong password in `DB_URL` | Double-check the password in `.env` matches what you set in `CREATE USER` |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL is not running | Start PostgreSQL: `sudo service postgresql start` (Linux) or open PostgreSQL app (Mac) |
| `ECONNREFUSED 127.0.0.1:8001` | AI service is not running | Start it: `cd ai-verification && python app.py` |
| `Cannot find module 'ethers'` | node_modules incomplete | Run `npm install` again |
| `invalid signature` on JWT requests | Wrong `JWT_SECRET` or token from a different environment | Generate a new `JWT_SECRET` in `.env` and re-login to get a fresh token |
| `NotAuthorizedVerifier` from blockchain | Backend wallet not set as verifier on contract | Follow the Post-Deploy Setup in [blockchain-setup.md](blockchain-setup.md) |
| `nonce has already been used` | Re-sending a transaction that was already mined | Wait and retry — ethers.js will auto-increment the nonce on the next call |
| `relation "users" does not exist` | Schema was not loaded | Run `psql -U wastewise_user -d wastewise -f src/models/schema.sql` |

---

## Rate Limits

The backend enforces rate limits to prevent abuse:

| Endpoint group | Limit |
|---------------|-------|
| Auth (register, login) | 5 requests per 15 minutes per IP |
| Submissions | 10 requests per hour per authenticated user |
| All other endpoints | Standard Express defaults |

During development you may hit auth rate limits if you register/login repeatedly while testing. Wait 15 minutes or temporarily disable the rate limiter in `src/middleware/rateLimiter.js`.
