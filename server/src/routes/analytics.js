"use strict";

const { Router } = require("express");
const {
  getDashboardStats,
  getHeatmapData,
  getTrends,
} = require("../controllers/analyticsController");
const { authenticate, requireRole } = require("../middleware/auth");

const router = Router();

// Analytics requires authentication; dashboard/trends are restricted to admin
router.use(authenticate);

router.get("/dashboard", requireRole("admin", "company"), getDashboardStats);
router.get("/heatmap", getHeatmapData);   // all authenticated users (for app map view)
router.get("/trends", requireRole("admin", "company"), getTrends);

module.exports = router;
