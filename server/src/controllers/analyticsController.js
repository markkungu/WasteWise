"use strict";

const db = require("../config/database");

/**
 * GET /analytics/dashboard
 * Returns aggregate platform statistics for the admin dashboard.
 */
const getDashboardStats = async (req, res) => {
  try {
    const [
      submissionStats,
      rewardStats,
      topNeighborhoods,
      recentActivity,
    ] = await Promise.all([
      // Submission counts by status
      db.query(`
        SELECT
          COUNT(*)                                          AS total_submissions,
          COUNT(*) FILTER (WHERE verification_status = 'APPROVED')  AS approved,
          COUNT(*) FILTER (WHERE verification_status = 'PENDING')   AS pending,
          COALESCE(SUM(reported_weight_kg), 0)              AS total_weight_kg
        FROM plastic_submissions
      `),

      // Reward totals
      db.query(`
        SELECT
          COALESCE(SUM(token_amount), 0)     AS total_tokens_issued,
          COALESCE(SUM(immediate_amount), 0) AS total_tokens_distributed,
          COUNT(DISTINCT user_id)            AS unique_recipients
        FROM rewards
      `),

      // Top 10 neighbourhoods by submission count (approximated by rounding GPS)
      db.query(`
        SELECT
          ROUND(latitude::numeric, 2)  AS lat_bucket,
          ROUND(longitude::numeric, 2) AS lng_bucket,
          COUNT(*)                     AS submission_count,
          COALESCE(SUM(reported_weight_kg), 0) AS total_weight_kg
        FROM plastic_submissions
        WHERE verification_status = 'APPROVED'
        GROUP BY lat_bucket, lng_bucket
        ORDER BY submission_count DESC
        LIMIT 10
      `),

      // Last 7 days activity
      db.query(`
        SELECT DATE(created_at) AS date, COUNT(*) AS submissions
        FROM plastic_submissions
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `),
    ]);

    return res.status(200).json({
      submissions: submissionStats.rows[0],
      rewards: rewardStats.rows[0],
      top_neighborhoods: topNeighborhoods.rows,
      recent_activity: recentActivity.rows,
    });
  } catch (err) {
    console.error("[analyticsController.getDashboardStats]", err.message);
    return res.status(500).json({ error: "Failed to retrieve dashboard statistics." });
  }
};

/**
 * GET /analytics/heatmap
 * Returns GPS coordinates with associated weights for frontend heatmap rendering.
 * Query params: limit (default 500), status (default APPROVED)
 */
const getHeatmapData = async (req, res) => {
  try {
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit) || 500));
    const status = req.query.status || "APPROVED";

    const result = await db.query(
      `SELECT latitude, longitude,
              COALESCE(reported_weight_kg, 1) AS weight,
              waste_type
       FROM plastic_submissions
       WHERE verification_status = $1
         AND latitude IS NOT NULL
         AND longitude IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [status, limit]
    );

    return res.status(200).json({
      points: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("[analyticsController.getHeatmapData]", err.message);
    return res.status(500).json({ error: "Failed to retrieve heatmap data." });
  }
};

/**
 * GET /analytics/trends
 * Returns time-series submission and reward data.
 * Query params: granularity (day|week, default day), days (default 30)
 */
const getTrends = async (req, res) => {
  try {
    const granularity = req.query.granularity === "week" ? "week" : "day";
    const days = Math.min(365, Math.max(7, parseInt(req.query.days) || 30));

    const truncFn = granularity === "week" ? "week" : "day";

    const [submissionTrends, rewardTrends, categoryBreakdown] = await Promise.all([
      // Submissions over time
      db.query(
        `SELECT
           DATE_TRUNC($1, created_at)               AS period,
           COUNT(*)                                 AS total_submissions,
           COUNT(*) FILTER (WHERE verification_status = 'APPROVED') AS approved,
           COALESCE(SUM(reported_weight_kg), 0)     AS total_weight_kg
         FROM plastic_submissions
         WHERE created_at >= NOW() - ($2 || ' days')::INTERVAL
         GROUP BY period
         ORDER BY period ASC`,
        [truncFn, days]
      ),

      // Rewards over time
      db.query(
        `SELECT
           DATE_TRUNC($1, created_at)          AS period,
           COUNT(*)                            AS rewards_issued,
           COALESCE(SUM(token_amount), 0)      AS tokens_issued
         FROM rewards
         WHERE created_at >= NOW() - ($2 || ' days')::INTERVAL
         GROUP BY period
         ORDER BY period ASC`,
        [truncFn, days]
      ),

      // Plastic category breakdown
      db.query(
        `SELECT
           waste_type,
           COUNT(*)                             AS count,
           COALESCE(SUM(reported_weight_kg), 0) AS total_weight_kg
         FROM plastic_submissions
         WHERE verification_status = 'APPROVED'
           AND waste_type IS NOT NULL
           AND created_at >= NOW() - ($1 || ' days')::INTERVAL
         GROUP BY waste_type
         ORDER BY count DESC`,
        [days]
      ),
    ]);

    return res.status(200).json({
      granularity,
      period_days: days,
      submission_trends: submissionTrends.rows,
      reward_trends: rewardTrends.rows,
      category_breakdown: categoryBreakdown.rows,
    });
  } catch (err) {
    console.error("[analyticsController.getTrends]", err.message);
    return res.status(500).json({ error: "Failed to retrieve trend data." });
  }
};

module.exports = { getDashboardStats, getHeatmapData, getTrends };
