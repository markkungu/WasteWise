"use strict";

const { Router } = require("express");
const { register, login, getProfile } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");

const router = Router();

// Public routes — apply strict auth rate limiting
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

// Protected route
router.get("/profile", authenticate, getProfile);

module.exports = router;
