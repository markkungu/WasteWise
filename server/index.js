"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { testConnection } = require("./src/config/database");
const { generalLimiter } = require("./src/middleware/rateLimiter");

// Route modules
const authRoutes       = require("./src/routes/auth");
const submissionRoutes = require("./src/routes/submissions");
const rewardRoutes     = require("./src/routes/rewards");
const routeRoutes      = require("./src/routes/routes");
const analyticsRoutes  = require("./src/routes/analytics");

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(generalLimiter);

// ---------------------------------------------------------------------------
// Health check (no auth required)
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "wastewise-api",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use("/api/auth",        authRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/rewards",     rewardRoutes);
app.use("/api/routes",      routeRoutes);
app.use("/api/analytics",   analyticsRoutes);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled error:", err.message);
  res.status(500).json({ error: "An unexpected error occurred." });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const start = async () => {
  try {
    await testConnection();
  } catch (dbErr) {
    console.error("[server] Database connection failed:", dbErr.message);
    console.warn("[server] Starting without database — DB-dependent routes will fail.");
  }

  app.listen(PORT, () => {
    console.log(`[server] WasteWise API listening on port ${PORT}`);
    console.log(`[server] Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`[server] ML service:  ${process.env.ML_SERVICE_URL || "http://localhost:8001"}`);
  });
};

start();

module.exports = app; // export for testing
