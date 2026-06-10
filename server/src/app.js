require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes       = require('./routes/auth');
const submissionRoutes = require('./routes/submissions');
const rewardRoutes     = require('./routes/rewards');
const routeRoutes      = require('./routes/routes');
const analyticsRoutes  = require('./routes/analytics');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

const authLimiter       = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,  standardHeaders: true, legacyHeaders: false });
const submissionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30,  standardHeaders: true, legacyHeaders: false });

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wastewise-api', timestamp: new Date().toISOString() });
});

app.use('/api/auth',        authLimiter,       authRoutes);
app.use('/api/submissions', submissionLimiter, submissionRoutes);
app.use('/api/rewards',     rewardRoutes);
app.use('/api/routes',      routeRoutes);
app.use('/api/analytics',   analyticsRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;
