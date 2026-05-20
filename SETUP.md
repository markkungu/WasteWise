# WasteWise — Setup Guide

WasteWise is a blockchain-based plastic recycling platform that incentivises community participation. Users photograph plastic waste, the system verifies it with AI, and mints ERC-20 tokens directly to the user's Ethereum wallet. A quantum-classical optimizer finds the shortest collection routes for waste collectors across Nairobi.

Built by three university students as a senior project:

| Role | Person | Module |
|------|--------|--------|
| Smart contracts | Mark Kungu | `blockchain/` |
| AI/ML verification | Antony Omondi | `ai-verification/` |
| Quantum optimization | Allan Mutai | `optimization/` |

Supervisor: Prof. Stephen Kimani

---

## Prerequisites

Before starting, install and verify every item below.

| Tool | Version | How to check | Where to get it |
|------|---------|--------------|-----------------|
| Node.js | 20 LTS or newer | `node --version` | https://nodejs.org |
| npm | 9+ (ships with Node) | `npm --version` | (bundled) |
| Python | 3.11 or newer | `python --version` | https://python.org |
| pip | 23+ | `pip --version` | (bundled with Python) |
| Git | any recent | `git --version` | https://git-scm.com |
| PostgreSQL | 14 or newer | `psql --version` | https://postgresql.org |
| MetaMask | browser extension | open browser | https://metamask.io — create a wallet and save your private key |
| Expo Go | phone app | open your phone | App Store / Google Play — search "Expo Go" |

---

## Quick Start — Run Everything Locally

Services must be started in this exact order because each one depends on the previous.

### Step 1 — Clone and install

```bash
git clone https://github.com/your-org/wastewise.git
cd wastewise

# Install all Node dependencies at once
cd blockchain && npm install && cd ..
cd server     && npm install && cd ..
cd client     && npm install && cd ..
```

### Step 2 — Set up PostgreSQL

```bash
# Connect as the postgres superuser and create the project database
psql -U postgres
```

Inside psql:

```sql
CREATE DATABASE wastewise;
CREATE USER wastewise_user WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE wastewise TO wastewise_user;
\q
```

Then load the schema:

```bash
psql -U wastewise_user -d wastewise -f server/src/models/schema.sql
```

### Step 3 — Deploy smart contracts

```bash
cd blockchain
cp .env.example .env   # fill in SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY
npx hardhat run scripts/deploy.js --network sepolia
```

Copy both deployed addresses into `server/.env`.
Full details: [docs/setup/blockchain-setup.md](docs/setup/blockchain-setup.md)

### Step 4 — Start the AI verification service

```bash
cd ai-verification
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python app.py
# Service starts on http://localhost:8001
```

Full details: [docs/setup/ai-setup.md](docs/setup/ai-setup.md)

### Step 5 — Start the quantum optimization service

```bash
cd optimization
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
# Service starts on http://localhost:8002
```

Full details: [docs/setup/quantum-setup.md](docs/setup/quantum-setup.md)

### Step 6 — Start the backend

```bash
cd server
cp .env.example .env   # fill in all values (DB, JWT, blockchain addresses, service URLs)
npm run dev
# Server starts on http://localhost:5000
```

Full details: [docs/setup/backend-setup.md](docs/setup/backend-setup.md)

### Step 7 — Start the mobile app

```bash
cd client
# Create .env with your machine's local IP (NOT localhost)
echo "EXPO_PUBLIC_API_URL=http://192.168.x.x:5000/api" > .env
npm start
# Scan the QR code with Expo Go on your phone
```

Full details: [docs/setup/frontend-setup.md](docs/setup/frontend-setup.md)

---

## Port Reference

| Service | Port | Start command |
|---------|------|---------------|
| Backend (Node/Express) | 5000 | `npm run dev` in `server/` |
| AI verification (FastAPI) | 8001 | `python app.py` in `ai-verification/` |
| Quantum optimization (FastAPI) | 8002 | `python app.py` in `optimization/` |
| Local Hardhat node (optional) | 8545 | `npx hardhat node` in `blockchain/` |

---

## Detailed Setup Guides (per role)

- [Blockchain / Smart Contracts](docs/setup/blockchain-setup.md) — Mark Kungu
- [AI Verification Service](docs/setup/ai-setup.md) — Antony Omondi
- [Quantum Optimization Service](docs/setup/quantum-setup.md) — Allan Mutai
- [Node.js Backend](docs/setup/backend-setup.md) — shared
- [React Native Mobile App](docs/setup/frontend-setup.md) — shared

## API Reference

Full endpoint documentation: [docs/api-schema.md](docs/api-schema.md)

---

## For AI Assistants

WasteWise is a five-service system. The mobile app (`client/`, React Native + Expo, port irrelevant) sends all requests to the Express backend (`server/index.js`, port 5000). The backend is the sole integration hub: it authenticates users with JWT (bcryptjs password hashing, 7-day tokens carrying `{ user_id, role }`), persists everything to PostgreSQL using the schema at `server/src/models/schema.sql` (tables: users, roles, wallets, plastic_submissions, verification, rewards, recycling_companies, optimized_routes), and orchestrates the two downstream Python services.

Submission flow: the mobile app POSTs `multipart/form-data` to `POST /api/submissions` with an image URL or file, GPS coordinates, and optional weight in kg. The backend stores a PENDING record, then makes an internal `POST /predict` call to the AI service on port 8001 (`ai-verification/app.py`, FastAPI). That service runs two checks in sequence: `SpoofDetector` (`inference/spoof_detector.py`) rejects blurry images (Laplacian variance threshold) and screen/printout artifacts (FFT moiré detection), then `PlasticPredictor` (`inference/predictor.py`) runs YOLOv8 (`ultralytics`) to classify plastic into PET/HDPE/LDPE/PP/PS. The service returns a `VerificationResponse` (schema at `inference/schema.py`) with fields `submission_id`, `verification_result` (APPROVED | REJECTED_SPOOF | REJECTED_INVALID_MATERIAL | REJECTED_LOW_QUALITY), `primary_category`, `detected_items_count`, `confidence_score` (float 0–1), `authenticity_verified`, `fraud_flags`, and `model_version`. If no trained model file is present, the service runs in stub mode and always returns confidence < 0.80, causing REJECTED_INVALID_MATERIAL — this prevents fake approvals during development while keeping the pipeline testable end-to-end.

If the AI returns APPROVED, the backend fetches the user's Ethereum wallet address from PostgreSQL and calls `RewardDistributor.issuePartialReward(bytes32 submissionId, address recipient, uint256 weightGrams)` on Ethereum Sepolia via ethers.js v6 (config at `server/src/config/blockchain.js`). The `submissionId` UUID is converted to `bytes32` by stripping hyphens and zero-padding to 64 hex chars. The smart contract (`blockchain/contracts/RewardDistributor.sol`) immediately mints 70% of `(weightGrams × 10 WWT) / 1000` to the user's wallet via `WasteToken.sol` (ERC-20, ticker WWT, 18 decimals), and stores the remaining 30% in an on-chain `pendingRewards[bytes32]` mapping. Only the `RewardDistributor` contract can call `WasteToken.mint()`. The backend wallet must be registered as an `authorizedVerifier` via `setVerifier()` before any rewards can be issued. The 30% is released later when a recycling company calls `POST /api/rewards/release` → `releaseFinalReward(bytes32)` on-chain. Batch rewards for assisted collectors (users who drop waste at a centre without the app) flow through `batchIssueRewards(centerId, submissionIds[], weightsGrams[])`, which mints to a registered custodial wallet for that centre. All reward-state-changing functions are `nonReentrant` and protected by the checks-effects-interactions pattern.

The quantum optimization service (`optimization/app.py`, FastAPI, port 8002) solves a 10-node Traveling Salesman Problem over Nairobi neighbourhoods (Westlands, Kibera, Eastleigh, Karen, Mathare, Kasarani, Embakasi, Langata, Ruaraka, Dagoretti) using two solvers: PSO (`pso_solver.py`, classical, swap-based permutation encoding, ~2 s, ~95% of optimal) and QAOA (`qaoa_solver.py`, Qiskit simulator, ~45 s, ~88% of optimal). The graph is built by `graph_builder.py` using NetworkX. Results are exposed at `GET /routes/latest` and compared via `comparison.py` which generates a 2×2 PNG chart. The backend triggers optimization via `POST /api/routes/optimize` and caches results in the `optimized_routes` table. The mobile MapScreen fetches routes via `GET /api/routes/latest` and renders polylines with react-native-maps.

Key locked data contracts (do not change field names): backend→AI uses `{ submission_id, image_url, center_id, latitude, longitude, timestamp }`; AI→backend uses `{ submission_id, verification_result, primary_category, detected_items_count, confidence_score, authenticity_verified, fraud_flags, model_version }`. On-chain functions are `issuePartialReward(bytes32, address, uint256)`, `batchIssueRewards(uint256, bytes32[], uint256[])`, and `releaseFinalReward(bytes32)`. Token amounts are stored as `NUMERIC(18,6)` in PostgreSQL, as `uint256` wei on-chain (18 decimals), and displayed rounded to 2 dp. Weight is reported by users in kg, converted to grams (`Math.round(kg × 1000)`) before blockchain calls, stored as `NUMERIC(8,3)`.

The frontend never calls the AI service, quantum service, or Ethereum directly — all integration goes through the backend. The backend starts cleanly even if the Python services are offline; submissions fail gracefully with a 202 PENDING status if the AI service is unreachable.
