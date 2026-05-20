"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");

const SALT_ROUNDS = 12;

/** Generate a signed JWT for a user record. */
const signToken = (user) =>
  jwt.sign(
    { user_id: user.id, role: user.role_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

/**
 * POST /auth/register
 * Body: { email, password, name, wallet_address? }
 */
const register = async (req, res) => {
  try {
    const { email, password, name, wallet_address } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password and name are required." });
    }

    // Check for duplicate email
    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Default role is 'user' (role_id = 1)
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, role_id, wallet_address)
       VALUES ($1, $2, $3, 1, $4)
       RETURNING id, email, name, wallet_address, created_at`,
      [email.toLowerCase(), password_hash, name, wallet_address || null]
    );

    const user = result.rows[0];
    const token = signToken({ id: user.id, role_name: "user" });

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        wallet_address: user.wallet_address,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error("[authController.register]", err.message);
    return res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

/**
 * POST /auth/login
 * Body: { email, password }
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required." });
    }

    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.password_hash, u.wallet_address, u.created_at,
              r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signToken(user);

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role_name,
        wallet_address: user.wallet_address,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error("[authController.login]", err.message);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
};

/**
 * GET /auth/profile  (protected)
 * Returns the authenticated user's profile.
 */
const getProfile = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.wallet_address, u.is_assisted_collector,
              u.collector_code, u.center_id, u.created_at, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error("[authController.getProfile]", err.message);
    return res.status(500).json({ error: "Could not retrieve profile." });
  }
};

module.exports = { register, login, getProfile };
