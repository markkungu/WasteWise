# WasteWise Smart Contracts

Network: **Ethereum Sepolia Testnet**
Solidity version: `^0.8.20`
OpenZeppelin version: `5.x`

---

## Deployment Addresses

| Contract             | Sepolia Address                            |
|----------------------|--------------------------------------------|
| `WasteToken`         | `0x_PLACEHOLDER_WASTE_TOKEN_ADDRESS`       |
| `RewardDistributor`  | `0x_PLACEHOLDER_REWARD_DISTRIBUTOR_ADDRESS`|

> Replace placeholders after running `npx hardhat run scripts/deploy.js --network sepolia`.
> Verify on Sepolia Etherscan: `npx hardhat verify --network sepolia <address> <constructor-args>`

---

## WasteToken.sol

**Location**: `blockchain/contracts/WasteToken.sol`

### What it does

An ERC-20 token (ticker: **WWT**, name: *WasteWise Token*, 18 decimals) that
can only be minted by a single designated `minter` address — normally the
`RewardDistributor` contract. The owner (platform deployer) can rotate the
minter address at any time.

### ABI Summary

| Function / Event                                | Visibility  | Description                                              |
|-------------------------------------------------|-------------|----------------------------------------------------------|
| `constructor(address initialOwner)`             | —           | Sets owner; no initial supply                            |
| `setMinter(address newMinter)`                  | `onlyOwner` | Grants exclusive minting rights to `newMinter`           |
| `mint(address to, uint256 amount)`              | minter only | Mints `amount` (wei) to `to`; reverts if caller ≠ minter |
| `minter()`                                      | view        | Returns the current minter address                       |
| `MinterUpdated(address prev, address newMinter)`| event       | Emitted on every `setMinter` call                        |

All standard ERC-20 functions (`transfer`, `approve`, `transferFrom`,
`balanceOf`, `totalSupply`, etc.) are inherited from OpenZeppelin ERC20.

### Custom Errors

| Error                  | When thrown                                      |
|------------------------|--------------------------------------------------|
| `NotMinter(address)`   | `mint()` called by address that is not `minter`  |
| `ZeroAddress()`        | `setMinter(address(0))` called                   |

---

## RewardDistributor.sol

**Location**: `blockchain/contracts/RewardDistributor.sol`

### What it does

Manages the two-step plastic waste reward lifecycle:

1. **Partial reward (70%)** — minted immediately when the AI verifies a
   submission as genuine plastic.
2. **Final reward (30%)** — held in on-chain escrow (`pendingRewards` mapping)
   and released only after an authorised recycling company confirms the waste
   was physically processed.

Also supports a **batch minting path** for assisted collectors at recycling
centres, where all rewards for a batch go to the centre's custodial wallet.

### Constants

| Name               | Value | Meaning                                         |
|--------------------|-------|-------------------------------------------------|
| `IMMEDIATE_PERCENT`| 70    | Percentage minted on approval                   |
| `PENDING_PERCENT`  | 30    | Percentage held in escrow                       |
| `tokensPerKg`      | 10 WWT (in wei = `10 × 10^18`) | Default reward rate; owner can update |

### Reward Calculation Formula

```
total     = (weightGrams × tokensPerKg) / 1000
immediate = (total × 70) / 100
pending   = total − immediate          // avoids rounding loss
```

**Example**: 500 g of plastic
- `total     = (500 × 10×10^18) / 1000 = 5 WWT`
- `immediate = 5 × 0.70 = 3.5 WWT`  ← minted now
- `pending   = 5 × 0.30 = 1.5 WWT`  ← escrowed until company co-signs

### Function Descriptions

#### `issuePartialReward(bytes32 submissionId, address recipient, uint256 weightGrams)`

- **Who can call**: authorised verifiers only (`authorizedVerifiers[msg.sender]`)
- **Guards**: `nonReentrant`, duplicate check (`processedSubmissions`), zero-weight check, zero-address check
- **Effects**: marks submission as processed, stores pending reward, mints `immediate` WWT to `recipient`
- **Emits**: `PartialRewardIssued(submissionId, recipient, immediateAmount, pendingAmount)`

#### `releaseFinalReward(bytes32 submissionId)`

- **Who can call**: authorised recycling companies (`authorizedCompanies[msg.sender]`)
- **Guards**: `nonReentrant`, checks reward exists and has not been released
- **Effects**: marks reward as released, mints `pending` amount to the original `recipient`
- **Emits**: `FinalRewardReleased(submissionId, recipient, amount)`

#### `batchIssueRewards(uint256 centerId, bytes32[] submissionIds, uint256[] weightsGrams)`

- **Who can call**: authorised verifiers
- **Guards**: `nonReentrant`, non-empty batch, centre wallet must be registered
- **Effects**: for each submission not yet processed, computes total reward and mints it to the centre's custodial wallet; already-processed IDs are silently skipped (safe for retry)
- **Emits**: `BatchRewardIssued(centerId, centerWallet, totalAmount, submissionsProcessed)`

#### `calculateReward(uint256 weightGrams) → (total, immediate, pending)`

Pure view function that returns the reward breakdown for a given weight.
Call from the backend or frontend before submitting to show the expected
reward without a transaction.

#### `getPendingReward(bytes32 submissionId) → (recipient, amount, released)`

View function to inspect the escrow state of any submission.

### Admin Functions

| Function                                          | Who         | Description                             |
|---------------------------------------------------|-------------|-----------------------------------------|
| `setTokensPerKg(uint256 newRate)`                 | owner       | Update reward rate (wei per kg)         |
| `setVerifier(address verifier, bool authorised)`  | owner       | Grant/revoke verifier role              |
| `setRecyclingCompany(address company, bool auth)` | owner       | Grant/revoke company role               |
| `registerCenterWallet(uint256 centerId, address)` | owner       | Map a centre ID to its custodial wallet |

### Custom Errors

| Error                              | When thrown                                         |
|------------------------------------|-----------------------------------------------------|
| `NotAuthorizedVerifier()`          | `issuePartialReward`/`batchIssueRewards` by non-verifier |
| `NotAuthorizedCompany()`           | `releaseFinalReward` by non-company address         |
| `AlreadyProcessed(bytes32)`        | Duplicate `submissionId` in `issuePartialReward`    |
| `ZeroWeight()`                     | `weightGrams == 0`                                  |
| `ZeroAddress()`                    | Recipient or wallet is `address(0)`                 |
| `RewardNotFound(bytes32)`          | Escrow entry missing in `releaseFinalReward`        |
| `RewardAlreadyReleased(bytes32)`   | Escrow already paid out                             |
| `CenterWalletNotRegistered(uint256)`| Centre has no registered wallet in `batchIssueRewards` |
| `EmptyBatch()`                     | Zero-length arrays in `batchIssueRewards`           |

---

## Two-Step Reward Flow

```
Submission approved by AI
         │
         ▼
issuePartialReward()
  ├─ Mints 70% → user wallet (immediately spendable)
  └─ Stores 30% in pendingRewards[submissionId]
         │
         │   (physical waste collected & weighed at centre)
         │
         ▼
releaseFinalReward()   ← called by authorised recycling company
  └─ Mints 30% → same user wallet
```

The 30% escrow acts as a fraud-deterrent: users have an incentive to submit
genuine waste because the full reward is only unlocked when the company
physically confirms receipt.

---

## Batch Minting Flow

```
Assisted collector drops waste at recycling centre
         │
         ▼
Centre logs submission IDs + weights
         │
         ▼
POST /api/rewards/batch-claim   (company role)
  { center_id, submission_ids[], weights_grams[] }
         │
         ▼
Backend calls batchIssueRewards()
  └─ Mints total WWT → centerWallets[centerId]
         │
         ▼
Centre distributes tokens to individual collectors
```

---

## Security Measures

| Measure                  | Implementation                                        |
|--------------------------|-------------------------------------------------------|
| Reentrancy protection    | `ReentrancyGuard` on all state-changing functions     |
| Access control           | `Ownable` (admin), `authorizedVerifiers`, `authorizedCompanies` |
| Duplicate prevention     | `processedSubmissions[bytes32]` mapping               |
| Checks-Effects-Interactions | `reward.released = true` before `token.mint()` in `releaseFinalReward` |
| Zero-address guard       | All address parameters validated                      |
| Minter isolation         | Only `RewardDistributor` can call `WasteToken.mint()` |
| Escrow separation        | Pending amounts stored on-chain, not in backend DB only |

---

## How the Backend Calls the Contracts

The backend uses **ethers.js v6** with a funded wallet (the authorised verifier)
to interact with `RewardDistributor`. Source: `server/src/config/blockchain.js`.

```js
const { ethers } = require("ethers");

const REWARD_DISTRIBUTOR_ABI = [
  "function issuePartialReward(bytes32 submissionId, address recipient, uint256 weightGrams) external",
  "function batchIssueRewards(uint256 centerId, bytes32[] calldata submissionIds, uint256[] calldata weightsGrams) external",
  "function releaseFinalReward(bytes32 submissionId) external",
];

const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC);
const signer   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const rewardDistributor = new ethers.Contract(
  process.env.REWARD_DISTRIBUTOR_ADDRESS,
  REWARD_DISTRIBUTOR_ABI,
  signer
);

// Issue 70% reward for one submission
const uuidToBytes32 = (uuid) =>
  "0x" + uuid.replace(/-/g, "").padEnd(64, "0");

const tx = await rewardDistributor.issuePartialReward(
  uuidToBytes32(submissionId),
  recipientAddress,
  BigInt(weightGrams)        // weight in grams
);
const receipt = await tx.wait();
console.log("tx hash:", receipt.hash);
```

### Required Setup After Deployment

1. Deploy `WasteToken` → note address A
2. Deploy `RewardDistributor(A, ownerAddress)` → note address B
3. `WasteToken.setMinter(B)` — grant minting rights to distributor
4. `RewardDistributor.setVerifier(backendWallet, true)` — authorise backend
5. `RewardDistributor.setRecyclingCompany(companyWallet, true)` — for each partner
6. `RewardDistributor.registerCenterWallet(centerId, custodialWallet)` — for each centre

Set `REWARD_DISTRIBUTOR_ADDRESS` in the backend `.env`.
