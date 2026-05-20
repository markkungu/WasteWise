"use strict";

const db = require("../config/database");
const { callReleaseFinalReward, callBatchIssueRewards } = require("../config/blockchain");

/**
 * GET /rewards
 * Returns paginated reward history for the authenticated user.
 */
const getUserRewards = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [rewardsResult, countResult] = await Promise.all([
      db.query(
        `SELECT r.id, r.submission_id, r.token_amount, r.immediate_amount,
                r.pending_amount, r.status, r.tx_hash, r.created_at,
                ps.image_url, ps.waste_type, ps.reported_weight_kg
         FROM rewards r
         JOIN plastic_submissions ps ON ps.id = r.submission_id
         WHERE r.user_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.user_id, limit, offset]
      ),
      db.query("SELECT COUNT(*) FROM rewards WHERE user_id = $1", [req.user.user_id]),
    ]);

    const total = parseInt(countResult.rows[0].count);

    // Aggregate totals
    const totalsResult = await db.query(
      `SELECT
         COALESCE(SUM(token_amount), 0)     AS total_earned,
         COALESCE(SUM(immediate_amount), 0) AS total_received,
         COALESCE(SUM(pending_amount), 0)   AS total_pending
       FROM rewards WHERE user_id = $1`,
      [req.user.user_id]
    );

    return res.status(200).json({
      rewards: rewardsResult.rows,
      totals: totalsResult.rows[0],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[rewardController.getUserRewards]", err.message);
    return res.status(500).json({ error: "Failed to retrieve rewards." });
  }
};

/**
 * POST /rewards/release
 * Body: { submission_id }
 *
 * Company co-signs to release the remaining 30 % of a reward.
 * Requires the caller to have the 'company' or 'admin' role.
 */
const releaseFinalReward = async (req, res) => {
  try {
    const { submission_id } = req.body;
    if (!submission_id) {
      return res.status(400).json({ error: "submission_id is required." });
    }

    // Verify the reward exists and is in PARTIAL status
    const rewardResult = await db.query(
      "SELECT * FROM rewards WHERE submission_id = $1 AND status = 'PARTIAL'",
      [submission_id]
    );

    if (rewardResult.rows.length === 0) {
      return res.status(404).json({
        error: "No pending partial reward found for this submission.",
      });
    }

    const reward = rewardResult.rows[0];

    // Call blockchain
    let txHash;
    try {
      const txResult = await callReleaseFinalReward(submission_id);
      txHash = txResult.txHash;
    } catch (blockchainErr) {
      console.error("[rewardController.releaseFinalReward] Blockchain error:", blockchainErr.message);
      return res.status(502).json({ error: "Blockchain transaction failed. Please try again." });
    }

    // Update reward status to COMPLETED
    await db.query(
      "UPDATE rewards SET status = 'COMPLETED', tx_hash = $1 WHERE id = $2",
      [txHash, reward.id]
    );

    return res.status(200).json({
      message: "Final reward released successfully.",
      submission_id,
      pending_amount: reward.pending_amount,
      tx_hash: txHash,
    });
  } catch (err) {
    console.error("[rewardController.releaseFinalReward]", err.message);
    return res.status(500).json({ error: "Failed to release reward." });
  }
};

/**
 * POST /rewards/batch-claim
 * Body: { center_id, submission_ids: [], weights_grams: [] }
 *
 * Issues batch rewards for assisted collectors at a recycling centre.
 */
const claimBatchReward = async (req, res) => {
  try {
    const { center_id, submission_ids, weights_grams } = req.body;

    if (!center_id || !Array.isArray(submission_ids) || !Array.isArray(weights_grams)) {
      return res.status(400).json({
        error: "center_id, submission_ids (array) and weights_grams (array) are required.",
      });
    }

    if (submission_ids.length !== weights_grams.length) {
      return res.status(400).json({
        error: "submission_ids and weights_grams must have the same length.",
      });
    }

    if (submission_ids.length === 0) {
      return res.status(400).json({ error: "At least one submission is required." });
    }

    // Verify all submissions belong to this center and are approved
    const submissionsResult = await db.query(
      `SELECT id FROM plastic_submissions
       WHERE id = ANY($1::text[]) AND verification_status = 'APPROVED'`,
      [submission_ids]
    );

    if (submissionsResult.rows.length !== submission_ids.length) {
      return res.status(400).json({
        error: "One or more submissions are not approved or do not exist.",
      });
    }

    // Call blockchain batch reward
    let txHash;
    try {
      const txResult = await callBatchIssueRewards(center_id, submission_ids, weights_grams);
      txHash = txResult.txHash;
    } catch (blockchainErr) {
      console.error("[rewardController.claimBatchReward] Blockchain error:", blockchainErr.message);
      return res.status(502).json({ error: "Blockchain batch transaction failed." });
    }

    return res.status(200).json({
      message: "Batch rewards issued successfully.",
      center_id,
      submissions_processed: submission_ids.length,
      tx_hash: txHash,
    });
  } catch (err) {
    console.error("[rewardController.claimBatchReward]", err.message);
    return res.status(500).json({ error: "Failed to process batch reward claim." });
  }
};

module.exports = { getUserRewards, releaseFinalReward, claimBatchReward };
