"use strict";

const jwt = require("jsonwebtoken");

/**
 * JWT authentication middleware.
 *
 * Expects: Authorization: Bearer <token>
 *
 * On success, attaches `req.user = { user_id, role }` and calls next().
 * On failure, responds with 401.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Provide a Bearer token." });
  }

  const token = authHeader.slice(7); // strip "Bearer "
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      user_id: payload.user_id,
      role: payload.role,
    };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
};

/**
 * Role-based authorisation factory.
 * Usage: router.get('/admin', authenticate, requireRole('admin'), handler)
 *
 * @param {...string} roles - Allowed role names
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Insufficient permissions." });
  }
  next();
};

module.exports = { authenticate, requireRole };
