"use strict";

const { Router } = require("express");
const {
  getOptimizedRoutes,
  triggerOptimization,
} = require("../controllers/routeController");
const { authenticate, requireRole } = require("../middleware/auth");

const router = Router();

// All route data is authenticated
router.use(authenticate);

// Any authenticated user can view the latest optimised routes
router.get("/latest", getOptimizedRoutes);

// Only admin can trigger a recomputation (expensive operation)
router.post("/optimize", requireRole("admin"), triggerOptimization);

module.exports = router;
