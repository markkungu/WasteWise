"use strict";

const rateLimit = require("express-rate-limit");

/**
 * General API rate limiter — applied globally.
 * 100 requests per 15 minutes per IP.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again after 15 minutes.",
  },
});

/**
 * Submission rate limiter — applied to POST /submissions.
 * 10 submissions per hour per IP to deter spam/fraud.
 */
const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Submission limit reached. You may submit up to 10 times per hour.",
  },
});

/**
 * Auth rate limiter — applied to /auth/login and /auth/register.
 * 10 attempts per 15 minutes per IP to mitigate brute-force attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again after 15 minutes.",
  },
});

module.exports = { generalLimiter, submissionLimiter, authLimiter };
