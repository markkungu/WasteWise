"use strict";

const { Router } = require("express");
const {
  getUserRewards,
  releaseFinalReward,
  claimBatchReward,
} = require("../controllers/rewardController");
const { authenticate, requireRole } = require("../middleware/auth");

const router = Router();

// All reward routes require authentication
router.use(authenticate);

// Any authenticated user can view their own rewards
router.get("/", getUserRewards);

// Only company or admin roles can release funds or issue batch rewards
router.post("/release", requireRole("company", "admin"), releaseFinalReward);
router.post("/batch-claim", requireRole("company", "admin"), claimBatchReward);

module.exports = router;
