/**
 * blockchain.js
 * Thin wrapper around the RewardDistributor smart contract.
 * Falls back to mock mode when RPC / key / address env vars are missing.
 */

const { v4: uuidv4 } = require('uuid');

let _contract = null;
let _mockMode = true;

async function init() {
  const rpc = process.env.BLOCKCHAIN_RPC;
  const key = process.env.PRIVATE_KEY;
  const addr = process.env.REWARD_DISTRIBUTOR_ADDRESS;

  if (!rpc || !key || !addr) {
    console.warn('[blockchain] Missing env vars — running in MOCK mode (no real txs).');
    _mockMode = true;
    return;
  }

  try {
    const { ethers } = require('ethers');
    const abi = [
      'function issuePartialReward(bytes32,address,uint256) external',
      'function releaseFinalReward(bytes32) external',
      'function batchIssueRewards(uint256,bytes32[],uint256[]) external',
      'function calculateReward(uint256) view returns (uint256,uint256,uint256)',
    ];
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(key, provider);
    _contract = new ethers.Contract(addr, abi, wallet);
    _mockMode = false;
    console.log('[blockchain] Connected to contract at', addr);
  } catch (err) {
    console.error('[blockchain] Init failed, using mock mode:', err.message);
    _mockMode = true;
  }
}

function _submissionToBytes32(submissionId) {
  const { ethers } = require('ethers');
  const hex = submissionId.replace(/-/g, '').padEnd(64, '0');
  return '0x' + hex;
}

function _fakeTxHash() {
  return '0x' + uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '').slice(0, 32);
}

async function issuePartialReward(submissionId, recipientAddress, weightGrams) {
  if (_mockMode) {
    const txHash = _fakeTxHash();
    console.log(`[blockchain:mock] issuePartialReward submission=${submissionId} recipient=${recipientAddress} weight=${weightGrams}g → ${txHash}`);
    return txHash;
  }
  const { ethers } = require('ethers');
  const sid = _submissionToBytes32(submissionId);
  const tx = await _contract.issuePartialReward(sid, recipientAddress, BigInt(weightGrams));
  const receipt = await tx.wait();
  return receipt.hash;
}

async function releaseFinalReward(submissionId) {
  if (_mockMode) {
    const txHash = _fakeTxHash();
    console.log(`[blockchain:mock] releaseFinalReward submission=${submissionId} → ${txHash}`);
    return txHash;
  }
  const { ethers } = require('ethers');
  const sid = _submissionToBytes32(submissionId);
  const tx = await _contract.releaseFinalReward(sid);
  const receipt = await tx.wait();
  return receipt.hash;
}

async function batchIssueRewards(centerId, submissionIds, weightsGrams) {
  if (_mockMode) {
    const txHash = _fakeTxHash();
    console.log(`[blockchain:mock] batchIssueRewards center=${centerId} count=${submissionIds.length} → ${txHash}`);
    return txHash;
  }
  const { ethers } = require('ethers');
  const sids = submissionIds.map(_submissionToBytes32);
  const weights = weightsGrams.map(BigInt);
  const tx = await _contract.batchIssueRewards(BigInt(centerId), sids, weights);
  const receipt = await tx.wait();
  return receipt.hash;
}

// 10 WWT per kg, 18 decimals — mirrors the on-chain formula
function calculateReward(weightGrams) {
  const tokensPerKg = 10;
  const total = (weightGrams * tokensPerKg) / 1000;
  const immediate = total * 0.7;
  const pending = total * 0.3;
  return { total, immediate, pending };
}

module.exports = { init, issuePartialReward, releaseFinalReward, batchIssueRewards, calculateReward };
