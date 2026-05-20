"use strict";

const { Router } = require("express");
const {
  createSubmission,
  getSubmissions,
  getSubmissionById,
} = require("../controllers/submissionController");
const { authenticate } = require("../middleware/auth");
const { submissionLimiter } = require("../middleware/rateLimiter");

const router = Router();

// All submission routes require authentication
router.use(authenticate);

router.post("/", submissionLimiter, createSubmission);
router.get("/", getSubmissions);
router.get("/:id", getSubmissionById);

module.exports = router;
