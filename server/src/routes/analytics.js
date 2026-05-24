const express = require('express');
const db = require('../db-adapter');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/analytics/dashboard
router.get('/dashboard', authenticate, requireRole('admin', 'company'), async (req, res) => {
  try {
    const data = await db.getAnalyticsDashboard();
    res.json(data);
  } catch (err) {
    console.error('[analytics] dashboard error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/analytics/heatmap
router.get('/heatmap', authenticate, async (req, res) => {
  try {
    const limit  = Math.min(2000, parseInt(req.query.limit) || 500);
    const status = req.query.status || 'APPROVED';
    const points = await db.getHeatmapData(status, limit);
    res.json({ points, count: points.length });
  } catch (err) {
    console.error('[analytics] heatmap error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/analytics/trends
router.get('/trends', authenticate, requireRole('admin', 'company'), async (req, res) => {
  try {
    const granularity = req.query.granularity === 'week' ? 'week' : 'day';
    const days = Math.min(365, Math.max(7, parseInt(req.query.days) || 30));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { subTrends, rewTrends, catBreakdown } = await db.getTrendsData(cutoff, granularity);
    res.json({
      granularity,
      period_days:        days,
      submission_trends:  subTrends,
      reward_trends:      rewTrends,
      category_breakdown: catBreakdown,
    });
  } catch (err) {
    console.error('[analytics] trends error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
