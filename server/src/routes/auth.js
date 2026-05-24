const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db-adapter');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, wallet_address, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email, and password are required.' });

    if (await db.findUserByEmail(email))
      return res.status(409).json({ error: 'Email already registered.' });

    const validRole = ['company', 'admin'].includes(role) ? role : 'user';
    const user = await db.createUser({
      id:             uuidv4(),
      name,
      email,
      password_hash:  await bcrypt.hash(password, 12),
      role:           validRole,
      wallet_address: wallet_address || null,
    });

    const token = jwt.sign({ user_id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const { password_hash, ...safe } = user;
    res.status(201).json({ message: 'Account created successfully.', token, user: safe });
  } catch (err) {
    console.error('[auth] register error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required.' });

    const user = await db.findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign({ user_id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const { password_hash, ...safe } = user;
    res.json({ message: 'Login successful.', token, user: safe });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/auth/profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await db.findUserById(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const { password_hash, ...safe } = user;
    res.json({ user: safe });
  } catch (err) {
    console.error('[auth] profile error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
