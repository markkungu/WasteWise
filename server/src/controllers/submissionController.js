"use strict";

const axios = require("axios");
const db = require("../config/database");
const { callIssuePartialReward } = require("../config/blockchain");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

/**
 * POST /submissions
 *
 * Flow:
 *  1. Validate request body.
 *  2. Persist submission with status PENDING.
 *  3. Call ML /predict endpoint.
 *  4. If APPROVED → call blockchain issuePartialReward.
 *  5. Persist verification record.
 *  6. Update submission status.
 *  7. Respond to client.
 */
const createSubmission = async (req, res) => {
  try {
    const {
      image_url,
      latitude,
      longitude,
      reported_weight_kg,
      waste_type,
      center_id,
    } = req.body;

    if (!image_url || latitude == null || longitude == null) {
      return res.status(400).json({ error: "image_url, latitude and longitude are required." });
    }

    const userId = req.user.user_id;

    // ---- Step 1: Persist initial submission ----
    const submissionResult = await db.query(
      `INSERT INTO plastic_submissions
         (user_id, image_url, latitude, longitude, reported_weight_kg, waste_type,
          verification_status, weight_validation_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'PENDING')
       RETURNING *`,
      [userId, image_url, latitude, longitude, reported_weight_kg || null, waste_type || null]
    );
    const submission = submissionResult.rows[0];

    // ---- Step 2: Call ML verification service ----
    let mlResponse;
    try {
      const mlPayload = {
        submission_id: submission.id,
        image_url: submission.image_url,
        center_id: center_id || null,
        latitude: submission.latitude,
        longitude: submission.longitude,
        timestamp: submission.created_at,
      };
      const { data } = await axios.post(`${ML_SERVICE_URL}/predict`, mlPayload, {
        timeout: 30_000,
      });
      mlResponse = data;
    } catch (mlErr) {
      console.error("[submissionController] ML service error:", mlErr.message);
      // Mark as PENDING so it can be retried; do not fail the submission entirely
      await db.query(
        "UPDATE plastic_submissions SET verification_status = 'PENDING' WHERE id = $1",
        [submission.id]
      );
      return res.status(202).json({
        message: "Submission received. Verification is pending due to a temporary service issue.",
        submission_id: submission.id,
        status: "PENDING",
      });
    }

    const isApproved = mlResponse.verification_result === "APPROVED";

    // ---- Step 3: Blockchain reward (approved only) ----
    let txHash = null;
    let rewardTokenAmount = null;

    if (isApproved) {
      try {
        // Fetch user wallet address
        const walletResult = await db.query(
          "SELECT wallet_address FROM users WHERE id = $1",
          [userId]
        );
        const walletAddress = walletResult.rows[0]?.wallet_address;

        if (walletAddress) {
          const weightGrams = Math.round((reported_weight_kg || 1) * 1000);
          const txResult = await callIssuePartialReward(
            submission.id,
            walletAddress,
            weightGrams
          );
          txHash = txResult.txHash;
          // Token amount calculation (example: 10 tokens per kg, 70 % issued now)
          rewardTokenAmount = Math.floor((reported_weight_kg || 1) * 10 * 0.7);
        } else {
          console.warn(
            "[submissionController] User %s has no wallet address — skipping blockchain reward.",
            userId
          );
        }
      } catch (blockchainErr) {
        console.error("[submissionController] Blockchain error:", blockchainErr.message);
        // Continue without blockchain — submission is still recorded
      }
    }

    // ---- Step 4: Persist verification record ----
    await db.query(
      `INSERT INTO verification
         (submission_id, verified_by, method_used, result, confidence_score,
          fraud_flags, model_version)
       VALUES ($1, 'AI', 'YOLO_V8', $2, $3, $4, $5)`,
      [
        submission.id,
        mlResponse.verification_result,
        mlResponse.confidence_score,
        JSON.stringify(mlResponse.fraud_flags),
        mlResponse.model_version,
      ]
    );

    // ---- Step 5: Update submission status ----
    const newStatus = isApproved ? "APPROVED" : mlResponse.verification_result;
    await db.query(
      `UPDATE plastic_submissions
       SET verification_status = $1, waste_type = COALESCE($2, waste_type)
       WHERE id = $3`,
      [newStatus, mlResponse.primary_category, submission.id]
    );

    // ---- Step 6: Persist reward record ----
    if (isApproved && rewardTokenAmount !== null) {
      await db.query(
        `INSERT INTO rewards
           (user_id, submission_id, token_amount, immediate_amount, pending_amount, status, tx_hash)
         VALUES ($1, $2, $3, $4, $5, 'PARTIAL', $6)`,
        [
          userId,
          submission.id,
          rewardTokenAmount / 0.7,            // total
          rewardTokenAmount,                  // 70 % now
          Math.floor((rewardTokenAmount / 0.7) * 0.3), // 30 % pending
          txHash,
        ]
      );
    }

    return res.status(201).json({
      message: isApproved ? "Submission approved and reward issued." : "Submission rejected.",
      submission_id: submission.id,
      verification_result: mlResponse.verification_result,
      primary_category: mlResponse.primary_category,
      detected_items_count: mlResponse.detected_items_count,
      confidence_score: mlResponse.confidence_score,
      authenticity_verified: mlResponse.authenticity_verified,
      fraud_flags: mlResponse.fraud_flags,
      model_version: mlResponse.model_version,
      reward: isApproved ? { token_amount: rewardTokenAmount, tx_hash: txHash } : null,
    });
  } catch (err) {
    console.error("[submissionController.createSubmission]", err.message);
    return res.status(500).json({ error: "Failed to process submission." });
  }
};

/**
 * GET /submissions
 * Query params: page (default 1), limit (default 20)
 */
const getSubmissions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [submissionsResult, countResult] = await Promise.all([
      db.query(
        `SELECT ps.*, v.result AS verification_result, v.confidence_score,
                v.fraud_flags, v.model_version
         FROM plastic_submissions ps
         LEFT JOIN verification v ON v.submission_id = ps.id
         WHERE ps.user_id = $1
         ORDER BY ps.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.user_id, limit, offset]
      ),
      db.query(
        "SELECT COUNT(*) FROM plastic_submissions WHERE user_id = $1",
        [req.user.user_id]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count);

    return res.status(200).json({
      submissions: submissionsResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[submissionController.getSubmissions]", err.message);
    return res.status(500).json({ error: "Failed to retrieve submissions." });
  }
};

/**
 * GET /submissions/:id
 */
const getSubmissionById = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ps.*, v.result AS verification_result, v.confidence_score,
              v.fraud_flags, v.model_version, v.verified_at,
              r.token_amount, r.immediate_amount, r.pending_amount,
              r.status AS reward_status, r.tx_hash
       FROM plastic_submissions ps
       LEFT JOIN verification v ON v.submission_id = ps.id
       LEFT JOIN rewards r ON r.submission_id = ps.id
       WHERE ps.id = $1 AND ps.user_id = $2`,
      [req.params.id, req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found." });
    }

    return res.status(200).json({ submission: result.rows[0] });
  } catch (err) {
    console.error("[submissionController.getSubmissionById]", err.message);
    return res.status(500).json({ error: "Failed to retrieve submission." });
  }
};

module.exports = { createSubmission, getSubmissions, getSubmissionById };
