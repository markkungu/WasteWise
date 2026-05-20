# WasteWise API Schema

All HTTP API endpoints are served by the Node/Express backend at
`http://localhost:5000` (production: Render service URL).

Base path: `/api`

---

## Authentication

All protected endpoints require the header:

```
Authorization: Bearer <JWT>
```

JWTs are signed with `JWT_SECRET`, expire after `JWT_EXPIRES_IN` (default `7d`),
and carry the payload `{ user_id: UUID, role: string }`.

Roles: `user` | `company` | `admin`

---

## Auth Endpoints

### POST /api/auth/register

Create a new user account.

**Rate limit**: strict (5 req/15 min per IP)

**Request body** (JSON)

| Field            | Type   | Required | Description                              |
|------------------|--------|----------|------------------------------------------|
| `name`           | string | yes      | Full display name                        |
| `email`          | string | yes      | Unique email address (stored lower-case) |
| `password`       | string | yes      | Plain-text (hashed with bcrypt/12)       |
| `wallet_address` | string | no       | Ethereum address `0x…` (42 chars)        |

**Response 201**

```json
{
  "message": "Account created successfully.",
  "token": "<JWT>",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Jane Doe",
    "wallet_address": "0x…",
    "created_at": "2025-01-01T00:00:00.000Z"
  }
}
```

**Errors**: `400` missing fields · `409` email already exists · `500` server error

---

### POST /api/auth/login

**Rate limit**: strict (5 req/15 min per IP)

**Request body** (JSON)

| Field      | Type   | Required |
|------------|--------|----------|
| `email`    | string | yes      |
| `password` | string | yes      |

**Response 200**

```json
{
  "message": "Login successful.",
  "token": "<JWT>",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Jane Doe",
    "role": "user",
    "wallet_address": "0x…",
    "created_at": "2025-01-01T00:00:00.000Z"
  }
}
```

**Errors**: `400` missing fields · `401` invalid credentials · `500` server error

---

### GET /api/auth/profile

**Auth**: required

**Response 200**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Jane Doe",
    "wallet_address": "0x…",
    "is_assisted_collector": false,
    "collector_code": null,
    "center_id": null,
    "created_at": "2025-01-01T00:00:00.000Z",
    "role": "user"
  }
}
```

---

## Submission Endpoints

All endpoints require authentication.

### POST /api/submissions

Submit a photo of plastic waste for AI verification.

**Rate limit**: 10 req/hour per user

**Request**: `multipart/form-data`

| Field                 | Type    | Required | Description                                  |
|-----------------------|---------|----------|----------------------------------------------|
| `image_url`           | string  | yes      | Public URL **or** upload the file as `image` |
| `latitude`            | float   | yes      | GPS latitude                                 |
| `longitude`           | float   | yes      | GPS longitude                                |
| `reported_weight_kg`  | float   | no       | User-reported weight                         |
| `waste_type`          | string  | no       | Plastic type hint (`PET`, `HDPE`, etc.)      |
| `center_id`           | integer | no       | Recycling centre ID (assisted collectors)    |

**Response 201 — approved**

```json
{
  "message": "Submission approved and reward issued.",
  "submission_id": "uuid",
  "verification_result": "APPROVED",
  "primary_category": "PET",
  "detected_items_count": 3,
  "confidence_score": 0.9421,
  "authenticity_verified": true,
  "fraud_flags": [],
  "model_version": "yolov8-wwaste-v1.2",
  "reward": {
    "token_amount": 7,
    "tx_hash": "0x…"
  }
}
```

**Response 201 — rejected**

```json
{
  "message": "Submission rejected.",
  "submission_id": "uuid",
  "verification_result": "REJECTED_SPOOF",
  "primary_category": null,
  "detected_items_count": 0,
  "confidence_score": 0.1200,
  "authenticity_verified": false,
  "fraud_flags": ["duplicate_image_hash"],
  "model_version": "yolov8-wwaste-v1.2",
  "reward": null
}
```

**Response 202 — ML service unavailable**

```json
{
  "message": "Submission received. Verification is pending due to a temporary service issue.",
  "submission_id": "uuid",
  "status": "PENDING"
}
```

`verification_result` values: `APPROVED` | `REJECTED_SPOOF` |
`REJECTED_INVALID_MATERIAL` | `REJECTED_LOW_QUALITY`

---

### GET /api/submissions

List the authenticated user's submissions (paginated).

**Query params**

| Param   | Default | Description         |
|---------|---------|---------------------|
| `page`  | 1       | Page number         |
| `limit` | 20      | Items per page (≤100) |

**Response 200**

```json
{
  "submissions": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "image_url": "https://…",
      "latitude": -1.2921,
      "longitude": 36.8219,
      "reported_weight_kg": "0.500",
      "waste_type": "PET",
      "verification_status": "APPROVED",
      "weight_validation_status": "PENDING",
      "submission_hash": "0x…",
      "created_at": "2025-01-01T00:00:00.000Z",
      "verification_result": "APPROVED",
      "confidence_score": "0.9421",
      "fraud_flags": [],
      "model_version": "yolov8-wwaste-v1.2"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "total_pages": 3
  }
}
```

---

### GET /api/submissions/:id

Retrieve a single submission (must belong to the authenticated user).

**Response 200**

Same fields as list item plus reward join fields:

```json
{
  "submission": {
    "...all submission fields...",
    "verified_at": "2025-01-01T00:01:30.000Z",
    "token_amount": "10.000000",
    "immediate_amount": "7.000000",
    "pending_amount": "3.000000",
    "reward_status": "PARTIAL",
    "tx_hash": "0x…"
  }
}
```

**Errors**: `404` not found (or belongs to another user)

---

## Reward Endpoints

### GET /api/rewards

**Auth**: required

**Query params**: `page`, `limit` (same as submissions)

**Response 200**

```json
{
  "rewards": [
    {
      "id": "uuid",
      "submission_id": "uuid",
      "token_amount": "10.000000",
      "immediate_amount": "7.000000",
      "pending_amount": "3.000000",
      "status": "PARTIAL",
      "tx_hash": "0x…",
      "created_at": "2025-01-01T00:00:00.000Z",
      "image_url": "https://…",
      "waste_type": "PET",
      "reported_weight_kg": "0.500"
    }
  ],
  "totals": {
    "total_earned": "10.000000",
    "total_received": "7.000000",
    "total_pending": "3.000000"
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "total_pages": 1
  }
}
```

`status` values: `PARTIAL` (70% issued, 30% pending) | `COMPLETED` | `FAILED`

---

### POST /api/rewards/release

**Auth**: required · **Roles**: `company`, `admin`

Release the pending 30% portion for a submission after the recycling company
confirms physical receipt.

**Request body** (JSON)

```json
{ "submission_id": "uuid" }
```

**Response 200**

```json
{
  "message": "Final reward released successfully.",
  "submission_id": "uuid",
  "pending_amount": "3.000000",
  "tx_hash": "0x…"
}
```

**Errors**: `400` missing field · `404` no PARTIAL reward found · `502` blockchain error

---

### POST /api/rewards/batch-claim

**Auth**: required · **Roles**: `company`, `admin`

Issue rewards in bulk for multiple assisted-collector submissions processed at
a recycling centre.

**Request body** (JSON)

```json
{
  "center_id": 1,
  "submission_ids": ["uuid1", "uuid2"],
  "weights_grams": [500, 750]
}
```

`submission_ids` and `weights_grams` must be parallel arrays of equal length.
All submissions must exist and have `verification_status = 'APPROVED'`.

**Response 200**

```json
{
  "message": "Batch rewards issued successfully.",
  "center_id": 1,
  "submissions_processed": 2,
  "tx_hash": "0x…"
}
```

---

## Route Endpoints

### GET /api/routes/latest

**Auth**: required

Returns the most recently optimised collection routes.

**Query params**

| Param  | Description              |
|--------|--------------------------|
| `zone` | Filter by zone/neighbourhood name |

**Response 200**

```json
{
  "routes": [
    {
      "id": 1,
      "zone": "Nairobi (all zones)",
      "route_order": ["Westlands", "Kibera", "Mathare", "..."],
      "total_distance_km": "84.320",
      "algorithm_used": "PSO",
      "improvement_percent": "12.40",
      "generated_at": "2025-01-01T06:00:00.000Z"
    }
  ],
  "count": 1
}
```

`route_order` is a JSONB array of stop identifiers (neighbourhood names or
`[lat, lng]` pairs, depending on the optimisation service output).

---

### POST /api/routes/optimize

**Auth**: required · **Role**: `admin`

Triggers a fresh optimisation run via the quantum/PSO service.

**Request body** (JSON)

```json
{
  "algorithm": "pso",
  "zones": []
}
```

`algorithm`: `"pso"` | `"qaoa"` | `"both"` (default `"pso"`)
`zones`: optional list of neighbourhood names to restrict the graph

**Response 200**

```json
{
  "message": "Route optimisation completed.",
  "routes_generated": 1,
  "route_ids": [42],
  "raw_result": { "...optimisation service response..." }
}
```

---

## Analytics Endpoints

### GET /api/analytics/dashboard

**Auth**: required · **Roles**: `admin`, `company`

**Response 200**

```json
{
  "submissions": {
    "total_submissions": "1200",
    "approved": "980",
    "pending": "42",
    "total_weight_kg": "612.500"
  },
  "rewards": {
    "total_tokens_issued": "9800.000000",
    "total_tokens_distributed": "6860.000000",
    "unique_recipients": "340"
  },
  "top_neighborhoods": [
    {
      "lat_bucket": -1.29,
      "lng_bucket": 36.82,
      "submission_count": "87",
      "total_weight_kg": "43.200"
    }
  ],
  "recent_activity": [
    { "date": "2025-01-01", "submissions": "35" }
  ]
}
```

---

### GET /api/analytics/heatmap

**Auth**: required (all roles)

Returns GPS coordinates for frontend heatmap rendering.

**Query params**

| Param    | Default    | Description                         |
|----------|------------|-------------------------------------|
| `limit`  | 500        | Max points returned (≤ 2000)        |
| `status` | `APPROVED` | Filter by `verification_status`     |

**Response 200**

```json
{
  "points": [
    {
      "latitude": -1.2921,
      "longitude": 36.8219,
      "weight": 0.5,
      "waste_type": "PET"
    }
  ],
  "count": 500
}
```

---

### GET /api/analytics/trends

**Auth**: required · **Roles**: `admin`, `company`

**Query params**

| Param         | Default | Description                  |
|---------------|---------|------------------------------|
| `granularity` | `day`   | `"day"` or `"week"`         |
| `days`        | 30      | Lookback window (7 – 365)    |

**Response 200**

```json
{
  "granularity": "day",
  "period_days": 30,
  "submission_trends": [
    {
      "period": "2025-01-01T00:00:00.000Z",
      "total_submissions": "35",
      "approved": "28",
      "total_weight_kg": "17.500"
    }
  ],
  "reward_trends": [
    {
      "period": "2025-01-01T00:00:00.000Z",
      "rewards_issued": "28",
      "tokens_issued": "280.000000"
    }
  ],
  "category_breakdown": [
    { "waste_type": "PET", "count": "420", "total_weight_kg": "210.000" }
  ]
}
```

---

## Health Check

### GET /health

No authentication required. Returns service status.

```json
{
  "status": "ok",
  "service": "wastewise-api",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## ML Service Contract — POST /predict

Internal endpoint on the AI Verification service (default port 8001).
The backend calls this directly; the frontend never calls it.

**Request** (JSON)

```json
{
  "submission_id": "string (UUID)",
  "image_url": "string (URL)",
  "center_id": "integer | null",
  "latitude": "float",
  "longitude": "float",
  "timestamp": "string (ISO 8601)"
}
```

**Response 200** (JSON)

```json
{
  "submission_id": "string (UUID)",
  "verification_result": "APPROVED | REJECTED_SPOOF | REJECTED_INVALID_MATERIAL | REJECTED_LOW_QUALITY",
  "primary_category": "string (e.g. PET, HDPE)",
  "detected_items_count": "integer",
  "confidence_score": "float [0.0, 1.0]",
  "authenticity_verified": "boolean",
  "fraud_flags": ["string"],
  "model_version": "string"
}
```

Defined by `VerificationResponse` in `ai-verification/inference/schema.py`.

---

## Quantum Optimization Service Contract — POST /optimize

Internal endpoint on the route-optimisation service (default port 8002).
The backend calls this from `POST /api/routes/optimize`.

**Request** (JSON)

```json
{
  "algorithm": "pso | qaoa | both",
  "zones": ["string (neighbourhood name)"]
}
```

**Response 200** — array of `OptimizedRoute` objects

```json
[
  {
    "zone": "Nairobi (all zones)",
    "route_order": ["Westlands", "Kibera", "Mathare"],
    "total_distance_km": 84.32,
    "algorithm_used": "PSO",
    "qaoa_vs_pso_improvement": "-2.1%",
    "generated_at": "2025-01-01T06:00:00+00:00"
  }
]
```

GET `/routes/latest` returns cached results without re-running the solver.
GET `/comparison` returns the PSO vs QAOA quality metrics for the last run.

---

## Smart Contract Function Signatures

See `docs/smart-contract.md` for full details.

### WasteToken.sol (ERC-20, ticker: WWT)

```solidity
function mint(address to, uint256 amount) external
function setMinter(address newMinter) external onlyOwner
```

### RewardDistributor.sol

```solidity
function issuePartialReward(bytes32 submissionId, address recipient, uint256 weightGrams) external nonReentrant
function releaseFinalReward(bytes32 submissionId) external nonReentrant
function batchIssueRewards(uint256 centerId, bytes32[] calldata submissionIds, uint256[] calldata weightsGrams) external nonReentrant
function calculateReward(uint256 weightGrams) public view returns (uint256 total, uint256 immediate, uint256 pending)
function getPendingReward(bytes32 submissionId) external view returns (address recipient, uint256 amount, bool released)
```

Reward formula: `total = (weightGrams × tokensPerKg) / 1000`
where `tokensPerKg = 10 × 10^18` (10 WWT per kg, 18 decimals).
Immediate = 70% · Pending = 30%.

---

## Locked Shared Data Contracts

These are the canonical types that all three roles (Backend, ML service,
Quantum service) must agree on. Do not change field names without updating
all three services.

### `VerificationResult` (string enum)
- `APPROVED`
- `REJECTED_SPOOF`
- `REJECTED_INVALID_MATERIAL`
- `REJECTED_LOW_QUALITY`

### `RewardStatus` (string enum)
- `PARTIAL` — 70% issued immediately; 30% in escrow
- `COMPLETED` — full reward released by company
- `FAILED` — blockchain transaction failed

### `SubmissionId` format
- UUID v4, stored as `TEXT` / `UUID` in PostgreSQL
- Converted to `bytes32` for blockchain via zero-padding:
  `"0x" + uuid.replace(/-/g, "").padEnd(64, "0")`

### Token amounts
- Stored as `NUMERIC(18, 6)` in PostgreSQL (6 decimal places)
- On-chain as `uint256` in token wei (18 decimals)
- Displayed to users rounded to 2 dp

### Weight
- Reported by user in **kg** (float)
- Passed to blockchain in **grams** (`Math.round(kg × 1000)`)
- Stored in PostgreSQL as `NUMERIC(8, 3)`
