"use strict";

const { ethers } = require("ethers");

// ---------------------------------------------------------------------------
// RewardDistributor ABI — only the functions the backend needs to call
// ---------------------------------------------------------------------------
const REWARD_DISTRIBUTOR_ABI = [
  // Issue 70 % immediately for a single verified submission
  "function issuePartialReward(bytes32 submissionId, address recipient, uint256 weightGrams) external returns (bool)",
  // Batch-issue rewards for assisted collectors at a recycling centre
  "function batchIssueRewards(uint256 centerId, bytes32[] calldata submissionIds, uint256[] calldata weightsGrams) external returns (bool)",
  // Release the remaining 30 % after company co-signature
  "function releaseFinalReward(bytes32 submissionId) external returns (bool)",
  // Events (for future indexing)
  "event RewardIssued(bytes32 indexed submissionId, address indexed recipient, uint256 amount)",
  "event FinalRewardReleased(bytes32 indexed submissionId, uint256 amount)",
];

// ---------------------------------------------------------------------------
// Provider & signer
// ---------------------------------------------------------------------------
const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC);

const signer = process.env.PRIVATE_KEY
  ? new ethers.Wallet(process.env.PRIVATE_KEY, provider)
  : null;

if (!signer) {
  console.warn(
    "[blockchain] PRIVATE_KEY not set — write calls will fail. " +
      "Read-only operations will still work."
  );
}

// ---------------------------------------------------------------------------
// Contract instance
// ---------------------------------------------------------------------------
const rewardDistributor =
  process.env.REWARD_DISTRIBUTOR_ADDRESS && signer
    ? new ethers.Contract(process.env.REWARD_DISTRIBUTOR_ADDRESS, REWARD_DISTRIBUTOR_ABI, signer)
    : null;

// ---------------------------------------------------------------------------
// Helper: convert a UUID string to a bytes32 value
// ---------------------------------------------------------------------------
const uuidToBytes32 = (uuid) => {
  const hex = uuid.replace(/-/g, "");
  return "0x" + hex.padEnd(64, "0");
};

// ---------------------------------------------------------------------------
// Exported call wrappers
// ---------------------------------------------------------------------------

/**
 * Issue 70 % partial reward for a single approved submission.
 *
 * @param {string} submissionId   - UUID of the submission
 * @param {string} recipientAddress - User's wallet address
 * @param {number} weightGrams    - Verified plastic weight in grams
 * @returns {Promise<{txHash: string}>}
 */
const callIssuePartialReward = async (submissionId, recipientAddress, weightGrams) => {
  if (!rewardDistributor) {
    throw new Error("RewardDistributor contract not configured.");
  }
  const tx = await rewardDistributor.issuePartialReward(
    uuidToBytes32(submissionId),
    recipientAddress,
    BigInt(weightGrams)
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

/**
 * Batch-issue rewards for assisted collectors at a recycling centre.
 *
 * @param {number}   centerId      - Recycling centre ID
 * @param {string[]} submissionIds - Array of submission UUIDs
 * @param {number[]} weightsGrams  - Corresponding weights in grams
 * @returns {Promise<{txHash: string}>}
 */
const callBatchIssueRewards = async (centerId, submissionIds, weightsGrams) => {
  if (!rewardDistributor) {
    throw new Error("RewardDistributor contract not configured.");
  }
  const ids = submissionIds.map(uuidToBytes32);
  const weights = weightsGrams.map(BigInt);
  const tx = await rewardDistributor.batchIssueRewards(BigInt(centerId), ids, weights);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

/**
 * Release the remaining 30 % reward after company co-signature.
 *
 * @param {string} submissionId - UUID of the submission
 * @returns {Promise<{txHash: string}>}
 */
const callReleaseFinalReward = async (submissionId) => {
  if (!rewardDistributor) {
    throw new Error("RewardDistributor contract not configured.");
  }
  const tx = await rewardDistributor.releaseFinalReward(uuidToBytes32(submissionId));
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
};

module.exports = {
  provider,
  rewardDistributor,
  callIssuePartialReward,
  callBatchIssueRewards,
  callReleaseFinalReward,
};
