# WasteWise System Architecture

---

## Full System Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                  │
│                                                                            │
│   ┌───────────────────────┐          ┌──────────────────────────────────┐  │
│   │   React Native App    │          │    React Web Dashboard           │  │
│   │   (Expo Go / builds)  │          │    (admin / company role)        │  │
│   │                       │          │                                  │  │
│   │  LoginScreen          │          │  /dashboard   (stats)            │  │
│   │  RegisterScreen       │          │  /submissions (table)            │  │
│   │  HomeScreen           │          │  /rewards     (release)          │  │
│   │  SubmitScreen         │          │  /map         (heatmap)          │  │
│   │  RewardsScreen        │          │  /trends      (charts)           │  │
│   │  MapScreen            │          │                                  │  │
│   └───────────┬───────────┘          └──────────────┬───────────────────┘  │
│               │  HTTP / JWT                          │  HTTP / JWT          │
└───────────────┼──────────────────────────────────────┼────────────────────┘
                │                                      │
                └──────────────────┬───────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │       BACKEND (Node/Express)   │
                    │       localhost:5000           │
                    │                               │
                    │  /api/auth                    │
                    │  /api/submissions             │
                    │  /api/rewards                 │
                    │  /api/routes                  │
                    │  /api/analytics               │
                    └──┬───────────┬───────────┬────┘
                       │           │           │
           ┌───────────▼──┐  ┌─────▼──────┐  ┌▼─────────────────┐
           │  AI Service  │  │  PostgreSQL│  │  Quantum Service  │
           │  (FastAPI)   │  │  Database  │  │  (FastAPI)        │
           │  port 8001   │  │            │  │  port 8002        │
           │              │  │  users     │  │                   │
           │  YOLOv8      │  │  plastic_  │  │  PSO solver       │
           │  model       │  │  submiss.  │  │  QAOA simulator   │
           │  /predict    │  │  rewards   │  │  /optimize        │
           │              │  │  routes    │  │  /routes/latest   │
           └──────────────┘  └────────────┘  └───────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │   Ethereum (Sepolia Testnet)   │
                    │                               │
                    │   WasteToken.sol (ERC-20)     │
                    │   RewardDistributor.sol        │
                    │                               │
                    │   Backend calls via ethers.js │
                    │   (frontend never touches)    │
                    └───────────────────────────────┘
```

---

## Technology Stack

### Client Layer

| Component         | Technology                        |
|-------------------|-----------------------------------|
| Mobile app        | React Native 0.74 + Expo SDK 51   |
| Navigation        | Expo Router 3.5 (file-based)      |
| Camera / GPS      | expo-camera, expo-location, expo-image-picker |
| Map rendering     | react-native-maps                 |
| HTTP client       | Axios 1.6                         |
| Token storage     | @react-native-async-storage       |
| Web dashboard     | React 18 + Vite (or Next.js)      |

### Backend

| Component         | Technology                         |
|-------------------|------------------------------------|
| Runtime           | Node.js 20 LTS                     |
| Framework         | Express 4                          |
| Auth              | jsonwebtoken + bcryptjs            |
| DB client         | node-postgres (pg)                 |
| Blockchain        | ethers.js v6                       |
| File handling     | multer (multipart uploads)         |
| Rate limiting     | express-rate-limit                 |
| Logging           | morgan                             |

### Database

| Component         | Technology                         |
|-------------------|------------------------------------|
| RDBMS             | PostgreSQL 15                      |
| Schema            | server/src/models/schema.sql       |
| ID format         | UUID v4 (gen_random_uuid())        |
| Timestamps        | TIMESTAMPTZ with DEFAULT NOW()     |

### AI Verification Service

| Component         | Technology                         |
|-------------------|------------------------------------|
| Framework         | FastAPI + uvicorn (port 8001)      |
| Model             | YOLOv8 (Ultralytics)               |
| Spoof detection   | Custom CNN / perceptual hash       |
| Schema            | Pydantic v2                        |

### Route Optimisation Service

| Component         | Technology                         |
|-------------------|------------------------------------|
| Framework         | FastAPI + uvicorn (port 8002)      |
| Classical solver  | PSO (Particle Swarm Optimisation)  |
| Quantum solver    | QAOA via Qiskit (simulator)        |
| Graph             | NetworkX (Nairobi neighbourhood graph) |

### Blockchain

| Component         | Technology                         |
|-------------------|------------------------------------|
| Network           | Ethereum Sepolia testnet           |
| Contracts         | Solidity 0.8.20 + OpenZeppelin 5   |
| Framework         | Hardhat                            |
| Token standard    | ERC-20 (WWT — WasteWise Token)     |

---

## Data Flow

### Submission Flow (happy path)

```
1. User opens SubmitScreen (mobile app)
2. Captures photo + GPS coordinates + optional weight
3. POST /api/submissions (multipart/form-data)  →  Backend
4. Backend persists submission (status: PENDING)  →  PostgreSQL
5. Backend POST /predict  →  AI Service (YOLOv8 + spoof detector)
6. AI Service returns VerificationResponse
7. If APPROVED:
   a. Backend fetches user wallet address from PostgreSQL
   b. Backend calls RewardDistributor.issuePartialReward()  →  Sepolia
   c. Smart contract mints 70% WWT to user wallet immediately
   d. Smart contract stores 30% in escrow (pendingRewards mapping)
   e. Backend persists verification + reward records  →  PostgreSQL
8. Backend responds 201 with verification_result + reward info
9. App displays approval / rejection screen
```

### Final Reward Release Flow

```
1. Recycling company physically weighs and processes the batch
2. Company user calls POST /api/rewards/release { submission_id }
3. Backend verifies PARTIAL reward exists in DB
4. Backend calls RewardDistributor.releaseFinalReward()  →  Sepolia
5. Smart contract mints the 30% escrowed amount to original recipient
6. Backend updates rewards.status = 'COMPLETED'
7. 200 response with tx_hash
```

### Batch Reward Flow (assisted collectors)

```
1. Company admin calls POST /api/rewards/batch-claim
   Body: { center_id, submission_ids[], weights_grams[] }
2. Backend verifies all submissions are APPROVED
3. Backend calls RewardDistributor.batchIssueRewards()  →  Sepolia
4. Contract mints total WWT to the registered center custodial wallet
5. Already-processed submissions are silently skipped (idempotent)
```

### Route Optimisation Flow

```
1. Admin triggers POST /api/routes/optimize (optional: algorithm, zones)
2. Backend POST /optimize  →  Quantum Service
3. Service runs PSO (and optionally QAOA via Qiskit simulator)
4. Results cached in-memory + persisted to optimized_routes table
5. Mobile MapScreen fetches GET /api/routes/latest
6. Backend queries optimized_routes table, returns route_order[]
7. MapScreen renders polylines + markers via react-native-maps
```

---

## Integration Points Between Roles

| Role A          | Role B              | Interface                            | Protocol   |
|-----------------|---------------------|--------------------------------------|------------|
| Backend         | AI Service          | POST /predict                        | HTTP/JSON  |
| Backend         | Quantum Service     | POST /optimize, GET /routes/latest   | HTTP/JSON  |
| Backend         | Ethereum (Sepolia)  | ethers.js contract calls             | JSON-RPC   |
| Mobile App      | Backend             | REST API with JWT auth               | HTTPS      |
| Web Dashboard   | Backend             | REST API with JWT auth               | HTTPS      |
| Smart Contracts | Backend wallet      | Authorized verifier/company roles    | On-chain   |

The frontend (mobile + dashboard) **never** calls the AI service, quantum
service, or blockchain directly. All interactions go through the backend.

---

## Database Table Relationships

```
roles (1) ──────────── (N) users
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         wallets (N)    plastic_submissions (N)  recycling_companies
                              │
              ┌───────────────┤
              │               │
        verification (1)   rewards (N)

optimized_routes   (independent, written by backend after /optimize)
```

### Key constraints

- `users.role_id` → `roles.id`
- `wallets.user_id` → `users.id` (CASCADE DELETE)
- `plastic_submissions.user_id` → `users.id` (CASCADE DELETE)
- `verification.submission_id` → `plastic_submissions.id` (CASCADE DELETE, UNIQUE)
- `rewards.user_id` → `users.id` (CASCADE DELETE)
- `rewards.submission_id` → `plastic_submissions.id` (SET NULL on delete)
- `plastic_submissions.submission_hash` — keccak256 fingerprint for dedup

---

## Deployment Architecture

### Services

| Service                | Platform        | Notes                                     |
|------------------------|-----------------|-------------------------------------------|
| Backend API            | Render (web)    | Node 20, PORT from env, `npm start`       |
| AI Verification        | Render (worker) | Python 3.11, uvicorn port 8001            |
| Quantum Optimisation   | Render (worker) | Python 3.11, uvicorn port 8002            |
| PostgreSQL             | Render Postgres | Managed, connection via DATABASE_URL      |
| Smart Contracts        | Sepolia testnet | Deployed via Hardhat deploy script        |
| Mobile App             | Expo Go (dev)   | Production: EAS Build → App Store / Play |
| Web Dashboard          | Render Static / Vercel | Vite/React build                  |

### Environment Variables (Backend)

```
DATABASE_URL=postgresql://…
JWT_SECRET=<random 64+ char string>
JWT_EXPIRES_IN=7d
ML_SERVICE_URL=https://wastewise-ai.onrender.com
OPTIMIZATION_SERVICE_URL=https://wastewise-opt.onrender.com
BLOCKCHAIN_RPC=https://sepolia.infura.io/v3/<key>
PRIVATE_KEY=<backend wallet private key>
REWARD_DISTRIBUTOR_ADDRESS=0x…
CORS_ORIGIN=https://wastewise-dashboard.vercel.app
PORT=5000
```

### Environment Variables (Mobile App)

```
EXPO_PUBLIC_API_URL=https://wastewise-api.onrender.com/api
```

### Smart Contract Addresses (Sepolia)

See `docs/smart-contract.md` for deployment addresses and verification links.
