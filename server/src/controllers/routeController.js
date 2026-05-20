"use strict";

const axios = require("axios");
const db = require("../config/database");

const OPTIMIZATION_SERVICE_URL =
  process.env.OPTIMIZATION_SERVICE_URL || "http://localhost:8002";

/**
 * GET /routes/latest
 * Returns the most recently computed optimised routes, optionally filtered by zone.
 */
const getOptimizedRoutes = async (req, res) => {
  try {
    const { zone } = req.query;

    let queryText = `
      SELECT id, zone, route_order, total_distance_km, algorithm_used,
             improvement_percent, generated_at
      FROM optimized_routes
    `;
    const params = [];

    if (zone) {
      queryText += " WHERE zone = $1";
      params.push(zone);
    }

    queryText += " ORDER BY generated_at DESC LIMIT 50";

    const result = await db.query(queryText, params);

    return res.status(200).json({
      routes: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("[routeController.getOptimizedRoutes]", err.message);
    return res.status(500).json({ error: "Failed to retrieve optimised routes." });
  }
};

/**
 * POST /routes/optimize
 * Body: { zone?, centers?: [], constraints?: {} }
 *
 * Triggers the quantum optimisation service to recompute routes and
 * persists the result to the database.
 */
const triggerOptimization = async (req, res) => {
  try {
    const payload = req.body || {};

    let optimizationResult;
    try {
      const { data } = await axios.post(
        `${OPTIMIZATION_SERVICE_URL}/optimize`,
        payload,
        { timeout: 60_000 } // optimisation can take time
      );
      optimizationResult = data;
    } catch (serviceErr) {
      console.error(
        "[routeController.triggerOptimization] Optimisation service error:",
        serviceErr.message
      );
      return res.status(502).json({
        error: "Optimisation service is unavailable. Please try again later.",
      });
    }

    // Persist results returned by the optimisation service
    const routes = Array.isArray(optimizationResult.routes)
      ? optimizationResult.routes
      : [];

    const insertedIds = [];
    for (const route of routes) {
      const insertResult = await db.query(
        `INSERT INTO optimized_routes
           (zone, route_order, total_distance_km, algorithm_used, improvement_percent)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          route.zone,
          JSON.stringify(route.route_order),
          route.total_distance_km,
          route.algorithm_used || "quantum_annealing",
          route.improvement_percent || 0,
        ]
      );
      insertedIds.push(insertResult.rows[0].id);
    }

    return res.status(200).json({
      message: "Route optimisation completed.",
      routes_generated: routes.length,
      route_ids: insertedIds,
      raw_result: optimizationResult,
    });
  } catch (err) {
    console.error("[routeController.triggerOptimization]", err.message);
    return res.status(500).json({ error: "Failed to trigger route optimisation." });
  }
};

module.exports = { getOptimizedRoutes, triggerOptimization };
