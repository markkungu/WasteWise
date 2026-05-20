# Blockchain — Smart Contract Setup

**Role owner:** Mark Kungu
**Module location:** `blockchain/`

---

## What This Module Does

The blockchain module contains two Solidity contracts that handle all on-chain token logic. The backend calls these contracts via ethers.js v6 after the AI service approves a submission.

### WasteToken.sol

An ERC-20 token with ticker **WWT** (WasteWise Token, 18 decimals). There is no initial supply — all tokens are minted on demand. Only one address (the `minter`) is allowed to call `mint()`. The owner sets the minter address once after deployment, pointing it at the `RewardDistributor` contract. The owner can rotate the minter at any time via `setMinter()`.

### RewardDistributor.sol

Manages the two-step plastic waste reward lifecycle:

- **Step 1 — Partial reward (70%):** An `authorizedVerifier` (the backend wallet) calls `issuePartialReward(bytes32 submissionId, address recipient, uint256 weightGrams)`. The contract mints 70% of the calculated token amount to the user's wallet immediately. The remaining 30% is stored in the on-chain `pendingRewards` mapping.
- **Step 2 — Final reward (30%):** An `authorizedCompany` (recycling company wallet) calls `releaseFinalReward(bytes32 submissionId)` after physically confirming receipt of the waste. The contract mints the escrowed 30% to the original recipient.
- **Batch path:** `batchIssueRewards(uint256 centerId, bytes32[] submissionIds, uint256[] weightsGrams)` mints the full reward for each submission directly to the centre's registered custodial wallet. This is used for assisted collectors who drop waste at a recycling centre without using the app.

**Reward formula:** `total = (weightGrams × tokensPerKg) / 1000` where `tokensPerKg = 10 × 10^18` (10 WWT per kg). 500 g of plastic earns 5 WWT: 3.5 minted immediately, 1.5 escrowed.

All state-changing functions use `ReentrancyGuard`. Duplicate `submissionId` values are rejected via a `processedSubmissions[bytes32]` mapping.

---

## Prerequisites

- Node.js 20 or newer
- npm 9 or newer
- A MetaMask wallet with the private key saved — this wallet pays gas fees on Sepolia and becomes the contract owner and authorized verifier
- A free Alchemy or Infura account for a Sepolia JSON-RPC URL

---

## Setup Steps

### 1. Install dependencies

```bash
cd blockchain
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in these three values:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=your_metamask_private_key_without_0x_prefix
ETHERSCAN_API_KEY=your_etherscan_api_key
```

**Where to get each value:**

| Variable | Where to get it |
|----------|----------------|
| `SEPOLIA_RPC_URL` | Create a free app at https://dashboard.alchemy.com or https://infura.io — copy the Sepolia HTTPS endpoint |
| `PRIVATE_KEY` | MetaMask → three-dot menu → Account Details → Export Private Key. Paste without the `0x` prefix. Keep this secret — never commit it. |
| `ETHERSCAN_API_KEY` | Create a free account at https://etherscan.io → API Keys → Add |

### 3. Get Sepolia test ETH

Your wallet needs test ETH to pay gas on Sepolia. Use one of these faucets:

- https://sepoliafaucet.com (Alchemy, requires sign-in)
- https://www.alchemy.com/faucets/ethereum-sepolia
- https://faucets.chain.link

Paste your MetaMask wallet address and request 0.5 ETH. It arrives within 1–2 minutes.

---

## Running Tests

Run the full test suite before deploying:

```bash
npx hardhat test
```

Run with coverage (shows which lines and functions are covered):

```bash
npx hardhat coverage
```

Expected result: all tests pass, 100% function coverage on both contracts.

---

## Deploying to Sepolia

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

The deploy script prints both contract addresses. Copy them — you need them in `server/.env`.

```
WasteToken deployed to:         0x...
RewardDistributor deployed to:  0x...
```

Paste into `server/.env`:

```env
WASTE_TOKEN_ADDRESS=0x...
REWARD_DISTRIBUTOR_ADDRESS=0x...
```

---

## Deploying Locally (for development without Sepolia)

Open two terminals:

**Terminal 1 — start local blockchain:**
```bash
npx hardhat node
```

This prints 20 funded test accounts. The first account is used as the deployer.

**Terminal 2 — deploy contracts:**
```bash
npx hardhat run scripts/deploy.js --network hardhat
```

For the backend to connect to your local node, set `BLOCKCHAIN_RPC=http://127.0.0.1:8545` in `server/.env`.

---

## Post-Deploy Setup (IMPORTANT)

After deploying, the backend wallet and any recycling company wallets must be authorized on-chain. Without this step, the backend cannot mint tokens and the reward system will not work.

Open a Hardhat console connected to Sepolia:

```bash
npx hardhat console --network sepolia
```

Then run these commands inside the console:

```javascript
// Attach to the deployed RewardDistributor
const dist = await ethers.getContractAt("RewardDistributor", "DEPLOYED_DISTRIBUTOR_ADDRESS")

// Authorize the backend wallet as a verifier (can call issuePartialReward)
await dist.setVerifier("BACKEND_WALLET_ADDRESS", true)

// Authorize the recycling company wallet (can call releaseFinalReward)
await dist.setRecyclingCompany("COMPANY_WALLET_ADDRESS", true)

// Register a recycling centre's custodial wallet for batch rewards
await dist.registerCenterWallet(1, "CENTER_WALLET_ADDRESS")
```

Replace the addresses with real values. The backend wallet address is the address that corresponds to the `PRIVATE_KEY` in `server/.env`.

---

## Verifying on Etherscan (optional)

After deployment, verify the source code so anyone can read the contract on Sepolia Etherscan:

```bash
# WasteToken — constructor takes the initial owner address
npx hardhat verify --network sepolia WASTE_TOKEN_ADDRESS "OWNER_ADDRESS"

# RewardDistributor — constructor takes token address and owner address
npx hardhat verify --network sepolia REWARD_DISTRIBUTOR_ADDRESS "WASTE_TOKEN_ADDRESS" "OWNER_ADDRESS"
```

---

## Contract Addresses (fill in after deploy)

```
Network:               Ethereum Sepolia Testnet
Chain ID:              11155111

WasteToken:            [deploy and paste here]
RewardDistributor:     [deploy and paste here]
```

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Insufficient funds` | Not enough Sepolia ETH for gas | Visit a faucet (see Step 3 above) |
| `Invalid private key` | Key has `0x` prefix or typo | Remove `0x` prefix from the key in `.env`; double-check no extra spaces |
| `nonce too high` | MetaMask account state is out of sync | Open MetaMask → Settings → Advanced → Reset Account |
| `NETWORK_ERROR` | Wrong RPC URL | Copy the Sepolia HTTPS URL from Alchemy/Infura dashboard exactly |
| `NotAuthorizedVerifier` when testing | Backend wallet not set as verifier | Run `setVerifier()` in the Hardhat console (see Post-Deploy Setup above) |
| `AlreadyProcessed` | Same submission ID sent twice | Each `submissionId` bytes32 can only be processed once — this is intentional |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `contracts/WasteToken.sol` | ERC-20 token contract |
| `contracts/RewardDistributor.sol` | Two-step reward logic |
| `scripts/deploy.js` | Deploy both contracts and wire them together |
| `test/` | Hardhat tests for both contracts |
| `hardhat.config.js` | Network config (Sepolia + local), Solidity version |
| `.env.example` | Template for required environment variables |

For full function signatures, custom errors, and security measures, see [docs/smart-contract.md](../smart-contract.md).
