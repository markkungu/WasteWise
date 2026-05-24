# WasteWise — Project Roles & Architecture Guide

## Overview

WasteWise is a blockchain-incentivised plastic recycling platform built for Nairobi communities. It rewards citizens with cryptocurrency tokens (WWT) for dropping off plastic waste at registered collection centres. An AI service verifies each submission, a route optimisation engine helps companies plan efficient collection, and a mobile app ties it all together.

**The platform connects three groups of people:**

| Role | Who they are | What they do |
|------|-------------|--------------|
| **User** | Nairobi resident | Takes a photo of plastic waste, submits it via the mobile app, earns WWT tokens |
| **Company** | Registered recycling business | Receives batched waste at collection centres, confirms processing, releases final token payouts |
| **Admin** | Platform operator | Manages the system, triggers route optimisation, views analytics dashboards |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mobile Client                           │
│              React Native + Expo Router  (:8081)                │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP / JWT
┌────────────────────────▼────────────────────────────────────────┐
│                       Backend API                               │
│                Node.js + Express  (:5000)                       │
│   auth  │  submissions  │  rewards  │  routes  │  analytics     │
└────┬────────────┬────────────────────────────┬──────────────────┘
     │            │ HTTP                        │ ethers.js
     │     ┌──────▼──────┐               ┌──────▼──────┐
     │     │ AI Service  │               │  Blockchain  │
     │     │  FastAPI    │               │   Hardhat    │
     │     │   (:8001)   │               │   (:8545)    │
     │     │  YOLOv8     │               │  WasteToken  │
     │     │  stub mode  │               │  RewardDist. │
     │     └─────────────┘               └─────────────┘
     │
┌────▼────────────────┐
│ Optimisation Service│
│  FastAPI  (:8002)   │
│  PSO + QAOA solver  │
└─────────────────────┘
```

**Data stores:**
- Docker: PostgreSQL 15 (`wastewise` database, port 5432)
- Local dev: in-memory JSON store, persisted to `server/wastewise-data.json`

---

## Service 1 — Mobile Client

**Location:** `client/`  
**Technology:** React Native 0.74, Expo 51, Expo Router 3.5  
**Runs on:** Expo dev server, port 8081

### What it does

The mobile app is the entry point for all three roles. After login it presents role-appropriate screens.

### Authentication flow

`client/app/index.js` — on app launch checks AsyncStorage for a saved token; redirects to `/home` if found or `/login` if not.

`client/src/services/api.js` — central Axios instance. Every request automatically attaches the JWT from AsyncStorage via a request interceptor (line 30–43). A 401 response clears the stored token (line 46–55).

```js
// api.js:30 — attach token to every request
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

### Screens by role

| Screen | File | Role | Purpose |
|--------|------|------|---------|
| Login | `client/src/screens/LoginScreen.js` | All | Email + password login, stores JWT |
| Register | `client/src/screens/RegisterScreen.js` | All | Create account, optional wallet address |
| Home | `client/src/screens/HomeScreen.js` | All | Dashboard summary, token balance, recent submissions |
| Submit | `client/src/screens/SubmitScreen.js` | User | Camera/picker → upload image + GPS coordinates |
| Rewards | `client/src/screens/RewardsScreen.js` | User | List of earned WWT rewards with tx hashes |
| Map | `client/src/screens/MapScreen.js` | All | Heatmap of approved submissions across Nairobi |

### API calls (client/src/services/api.js)

```js
// Submit plastic waste (multipart form with image + GPS)
submitWaste(imageUri, latitude, longitude, reportedWeightKg)   // POST /submissions

// Get user's submission history
getSubmissions(page, limit)                                     // GET  /submissions

// Get token reward history
getRewards(page, limit)                                         // GET  /rewards

// Get optimised collection routes (admin/company)
getRoutes()                                                     // GET  /routes/latest

// Get analytics dashboard (admin/company)
getDashboardStats()                                             // GET  /analytics/dashboard
```

---

## Service 2 — Backend API

**Location:** `server/`  
**Technology:** Node.js 20, Express 4  
**Runs on:** port 5000  
**Entry point:** `server/src/index.js`

### What it does

The backend is the central hub. It authenticates users, orchestrates the AI verification call, records submissions, issues blockchain rewards, and exposes analytics.

### Startup sequence (`server/src/index.js:42–52`)

```js
(async () => {
  await initSchema();      // creates DB tables (PostgreSQL) or loads JSON (memory mode)
  await blockchain.init(); // connects to contract or enables mock mode
  app.listen(PORT, ...);
})();
```

### Database layer

`server/src/db.js` — switches backend based on environment:
```js
if (process.env.DATABASE_URL) {
  module.exports = require('./db-postgres'); // pg Pool → PostgreSQL
} else {
  module.exports = require('./db-memory');   // JSON file → wastewise-data.json
}
```

`server/src/db-adapter.js` — unified async data access layer used by all routes. Every function works against both backends without routes needing to know which is active. Key functions:

```js
findUserByEmail(email)                           // auth: login lookup
createUser({ id, name, email, ... })             // auth: registration
createSubmission(sub)                            // submissions: record drop-off
updateSubmissionStatus(id, status)               // submissions: PENDING → APPROVED/REJECTED
createVerification(verif)                        // submissions: store AI result
createReward(reward)                             // submissions: issue partial reward record
findRewardsByUser(user_id, page, limit)          // rewards: user history
findRewardBySubmission(submission_id, status)    // rewards: release lookup
findLatestRoutes(zone, limit)                    // routes: last optimised routes
getAnalyticsDashboard()                          // analytics: aggregate stats
```

### Authentication (`server/src/middleware/auth.js`)

```js
function authenticate(req, res, next) {
  // Verifies "Authorization: Bearer <jwt>" header
  // Attaches decoded { user_id, role } to req.user
}

function requireRole(...roles) {
  // Middleware factory — blocks requests from wrong roles
  // Example: requireRole('admin') blocks users and companies
}
```

JWT payload shape: `{ user_id: "<uuid>", role: "user" | "company" | "admin" }`

### Route modules

#### `server/src/routes/auth.js` — All roles

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | Create account. `role` field accepts `user` (default), `company`, `admin` |
| `POST /api/auth/login` | Returns signed JWT. Password verified with bcrypt |
| `GET  /api/auth/profile` | Returns authenticated user object (no password hash) |

#### `server/src/routes/submissions.js` — User role

| Endpoint | Description |
|----------|-------------|
| `POST /api/submissions` | Upload image + GPS. Calls AI service, records result, issues blockchain reward |
| `GET  /api/submissions` | Paginated list of the authenticated user's submissions |
| `GET  /api/submissions/:id` | Single submission with verification details and reward info |

**Submission lifecycle:**
```
User uploads image
       ↓
Backend records submission (status: PENDING)
       ↓
Calls AI service POST /predict
       ↓
  APPROVED?  ──Yes──→  Issue blockchain reward (70% immediate, 30% escrowed)
      │                Record reward in DB
      No
      ↓
  Mark REJECTED
```

#### `server/src/routes/rewards.js` — User / Company / Admin

| Endpoint | Role | Description |
|----------|------|-------------|
| `GET  /api/rewards` | User | Paginated reward history with token amounts and tx hashes |
| `POST /api/rewards/release` | Company, Admin | Release the escrowed 30% for a single submission |
| `POST /api/rewards/batch-claim` | Company, Admin | Release rewards for multiple submissions in one blockchain tx |

#### `server/src/routes/routes.js` — All / Admin

| Endpoint | Role | Description |
|----------|------|-------------|
| `GET  /api/routes/latest` | All (authenticated) | Returns last 10 optimised collection routes |
| `POST /api/routes/optimize` | Admin only | Triggers PSO/QAOA solver, stores results |

#### `server/src/routes/analytics.js` — Admin / Company

| Endpoint | Description |
|----------|-------------|
| `GET /api/analytics/dashboard` | Total submissions, approval rate, tokens issued, top neighbourhoods |
| `GET /api/analytics/heatmap` | GPS coordinates of approved submissions for map overlay |
| `GET /api/analytics/trends` | Daily/weekly submission and reward trends over N days |

### Blockchain module (`server/src/blockchain.js`)

Wraps the `RewardDistributor` smart contract. Operates in **mock mode** when `BLOCKCHAIN_RPC`, `PRIVATE_KEY`, and `REWARD_DISTRIBUTOR_ADDRESS` environment variables are not set — generating fake tx hashes so the rest of the system works without a live blockchain.

```js
// 10 WWT per kg, 70/30 split
function calculateReward(weightGrams) {
  const total     = (weightGrams * 10) / 1000;
  const immediate = total * 0.7;  // paid immediately
  const pending   = total * 0.3;  // held in escrow
  return { total, immediate, pending };
}
```

---

## Service 3 — AI Verification Service

**Location:** `ai-verification/`  
**Technology:** Python 3.11, FastAPI, Uvicorn  
**Runs on:** port 8001

### What it does

Analyses a submitted image to confirm it actually contains plastic waste, classify the plastic type, and detect potential fraud (spoofed/duplicate images).

### Key files

**`ai-verification/app.py`** — FastAPI app with two startup modes. On launch it attempts to load a YOLOv8 model file from `MODEL_PATH`. If the file is absent it enters stub mode automatically.

**`ai-verification/inference/predictor.py`** — `PlasticPredictor` class:
- **Real mode:** Runs YOLOv8 inference via `ultralytics.YOLO`, returns bounding boxes and class confidences for PET, HDPE, LDPE, PP, PS plastic types
- **Stub mode:** Returns a deterministic mock prediction seeded by an MD5 hash of the image pixels — same image always gives same result, enabling reproducible testing

```python
# predictor.py:67 — stub mode falls back when model file is missing
def _load_model(self, model_path):
    if not model_path or not os.path.exists(model_path):
        self._stub_mode = True  # no torch required
        return
    from ultralytics import YOLO
    self.model = YOLO(model_path)
```

**`ai-verification/inference/spoof_detector.py`** — Anti-fraud checks:
- **Blur detection:** Laplacian variance — blurry images score low (photographs of photos are typically blurred)
- **Moire pattern detection:** FFT frequency analysis — detects screen-captured images

### API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET  /health` | Service status + whether model is loaded or in stub mode |
| `GET  /model/info` | Model version, class list, confidence threshold |
| `POST /predict` | Accepts `{ submission_id, image_url, latitude, longitude, timestamp }`, returns verification result |

**Response shape from `/predict`:**
```json
{
  "verification_result":  "APPROVED" | "REJECTED",
  "primary_category":     "PET",
  "detected_items_count": 3,
  "confidence_score":     0.87,
  "authenticity_verified": true,
  "fraud_flags":          [],
  "model_version":        "plastic-yolo-v1.2"
}
```

> **Note:** In stub mode the confidence score is always below the 0.80 threshold, so all stub submissions return `REJECTED`. This is intentional — it forces real model weights to be needed for approvals.

---

## Service 4 — Route Optimisation Service

**Location:** `optimization/`  
**Technology:** Python 3.11, FastAPI, NumPy, NetworkX  
**Runs on:** port 8002

### What it does

Computes the shortest collection route across Nairobi's waste pickup points. Two algorithms run and are compared — PSO (deterministic, production-ready) and QAOA (quantum-inspired, experimental).

### Graph (`optimization/graph_builder.py`)

10 Nairobi neighbourhoods modelled as nodes with known road distances between them:

```
Westlands, CBD, Eastleigh, Kibera, Karen,
Kasarani, Embakasi, Langata, Ruaraka, Ngong Road
```

Distances are stored as a hardcoded dictionary of real approximate road distances (km) and converted to a NumPy distance matrix at startup.

### PSO Solver (`optimization/pso_solver.py`)

Swap-based Particle Swarm Optimisation adapted for TSP (Travelling Salesman Problem):
- **Particles** = candidate routes (permutations of node indices)
- **Velocity** = ordered list of `(i, j)` swap operations
- Each iteration: particles move toward their personal best and the global best via probabilistic swap merging
- Finds near-optimal collection routes in milliseconds

```python
# pso_solver.py — core update step
# velocity = swaps that move position → pbest (c1) and → gbest (c2)
new_velocity = (inertia_swaps) + (c1 * pbest_swaps) + (c2 * gbest_swaps)
```

### QAOA Solver (`optimization/qaoa_solver.py`)

Quantum Approximate Optimisation Algorithm implementation:
- **Real QAOA:** Uses Qiskit to encode the TSP as a QUBO and run on a simulated quantum circuit
- **Simulated fallback** (`QAOASimulatedSolver`): Used when Qiskit is not installed. Mimics QAOA behaviour using classical random perturbation with acceptance probability — used in Docker mode

### Comparison (`optimization/comparison.py`)

Runs both solvers on the same graph and returns improvement metrics:
```json
{
  "pso_distance_km":  47.3,
  "qaoa_distance_km": 45.1,
  "improvement":      "4.6%"
}
```

### API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET  /health` | Service status |
| `POST /optimize` | Run optimisation. Body: `{ "algorithm": "pso" \| "qaoa", "zones": [] }` |
| `GET  /routes/latest` | Last computed routes |
| `GET  /comparison` | PSO vs QAOA side-by-side comparison |

---

## Service 5 — Blockchain

**Location:** `blockchain/`  
**Technology:** Solidity 0.8.20, Hardhat, OpenZeppelin  
**Runs on:** port 8545 (local Ethereum node, chainId 31337)

### What it does

Provides tamper-proof, on-chain token rewards. Two smart contracts work together.

### WasteToken (`blockchain/contracts/WasteToken.sol`)

ERC-20 token with symbol **WWT** (WasteWise Token). Standard token with one restriction: only the designated `minter` address (set by the owner) can call `mint()`. In production the `RewardDistributor` contract is set as the minter.

```solidity
// WasteToken.sol:51 — only the minter can create tokens
function mint(address to, uint256 amount) external {
    if (msg.sender != minter) revert NotMinter(msg.sender);
    _mint(to, amount);
}
```

### RewardDistributor (`blockchain/contracts/RewardDistributor.sol`)

Core reward logic with three functions used by the backend:

**`issuePartialReward(submissionId, recipient, weightGrams)`**  
Called after AI approval. Mints **70%** of the reward immediately to the user's wallet. Stores the **30%** in an on-chain escrow mapping keyed by submission ID. Prevents double-processing via `processedSubmissions` mapping.

**`releaseFinalReward(submissionId)`**  
Called by an authorised recycling company after physical processing is confirmed. Releases the escrowed 30% to the original recipient.

**`batchIssueRewards(centerId, submissionIds[], weightsGrams[])`**  
Issues rewards for an entire centre's worth of submissions in a single transaction. Already-processed submissions are silently skipped, making retries safe.

**Reward formula:**
```
total     = weightGrams × 10 WWT / 1000    (= 10 WWT per kg)
immediate = total × 70%
escrowed  = total × 30%
```

### Role-based access on-chain

| Contract role | Controlled by | Permission |
|--------------|---------------|------------|
| `authorizedVerifiers` | Owner | Can call `issuePartialReward`, `batchIssueRewards` |
| `authorizedCompanies` | Owner | Can call `releaseFinalReward` |
| `minter` (WasteToken) | Owner | Can mint WWT tokens |

---

## Role Summary — What Each User Can Do

### User Role

Registered with `role: "user"` (default).

- Register / login via mobile app
- Submit plastic waste: photo + GPS → AI verification → earn WWT tokens
- View their submission history with verification status
- View earned rewards: immediate WWT received, pending WWT in escrow
- View the collection map (heatmap of all approved submissions)

**Restricted from:** analytics dashboard, route optimisation, reward release

---

### Company Role

Registered with `role: "company"`.

- Everything a user can do, plus:
- View analytics dashboard (`GET /api/analytics/dashboard`)
- View submission trends (`GET /api/analytics/trends`)
- Release escrowed 30% rewards for processed submissions (`POST /api/rewards/release`)
- Process entire batches at once (`POST /api/rewards/batch-claim`)

**Workflow:** Company receives physical plastic → confirms processing → calls `/rewards/release` → user's escrow unlocks → 30% WWT minted to user wallet

---

### Admin Role

Registered with `role: "admin"`.

- Everything companies can do, plus:
- Trigger route optimisation (`POST /api/routes/optimize`)
- View all analytics endpoints

---

## Running the Project

### Option A — Docker (Recommended, works offline after first build)

**Prerequisites:** Docker Desktop installed and running.

```bash
# From the project root
cd ~/Desktop/ct/finally/WasteWise

# Build all images (required once; needs internet on first run)
docker compose build

# Start all services in the background
docker compose up -d

# Check that all services are healthy
docker compose ps

# View live logs from all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f backend
docker compose logs -f ai-verification
docker compose logs -f optimization
docker compose logs -f blockchain

# Stop everything
docker compose down

# Stop and delete the database volume (full reset)
docker compose down -v
```

**Services after `docker compose up -d`:**

| Service | URL | Notes |
|---------|-----|-------|
| Backend API | http://localhost:5000 | Health: http://localhost:5000/health |
| AI Verification | http://localhost:8001 | Health: http://localhost:8001/health |
| Optimisation | http://localhost:8002 | Health: http://localhost:8002/health |
| Blockchain (Hardhat) | http://localhost:8545 | Local Ethereum node |
| PostgreSQL | localhost:5432 | DB: `wastewise`, user: `wastewise` |

**Then start the mobile client separately:**
```bash
cd client
npx expo start
```

---

### Option B — Local (No Docker)

**Prerequisites:** Node.js 18+, Python 3.11+, uvicorn installed globally.

```bash
# Install Python dependencies
cd ai-verification && pip install -r requirements.txt
cd ../optimization  && pip install -r requirements.txt

# Install Node dependencies
cd ../server     && npm install
cd ../blockchain && npm install --legacy-peer-deps

# Start all services (waits up to 90s for each to become ready)
cd ~/Desktop/ct/finally/WasteWise
bash start-all.sh

# Start the mobile client
cd client && npx expo start
```

**Individual service commands:**

```bash
# Backend API (port 5000)
cd server && node src/index.js

# AI Verification Service (port 8001)
cd ai-verification && uvicorn app:app --host 0.0.0.0 --port 8001

# Optimisation Service (port 8002)
cd optimization && uvicorn app:app --host 0.0.0.0 --port 8002

# Hardhat local blockchain (port 8545)
cd blockchain && NODE_OPTIONS=--no-warnings npx hardhat node --port 8545

# Mobile client
cd client && npx expo start
```

**Log files (when using start-all.sh):**
```
/tmp/wastewise-ai.log       ← AI service output
/tmp/wastewise-opt.log      ← Optimisation service output
/tmp/wastewise-api.log      ← Backend API output
/tmp/wastewise-hardhat.log  ← Blockchain node output
```

---

### Environment Variables

The backend reads from `server/.env`. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Backend API port |
| `JWT_SECRET` | set in .env | Secret for signing JWTs |
| `DATABASE_URL` | _(unset)_ | PostgreSQL URL. If unset, uses in-memory JSON store |
| `ML_SERVICE_URL` | `http://localhost:8001` | AI service base URL |
| `OPTIMIZATION_SERVICE_URL` | `http://localhost:8002` | Optimisation service base URL |
| `BLOCKCHAIN_RPC` | _(unset)_ | Ethereum RPC endpoint. If unset, mock mode is used |
| `PRIVATE_KEY` | _(unset)_ | Wallet private key for signing blockchain txs |
| `REWARD_DISTRIBUTOR_ADDRESS` | _(unset)_ | Deployed contract address |

---

### Quick API Test

```bash
# Register a user
curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}' | python3 -m json.tool

# Login and get token
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | python3 -m json.tool

# Health checks
curl http://localhost:5000/health
curl http://localhost:8001/health
curl http://localhost:8002/health
```
