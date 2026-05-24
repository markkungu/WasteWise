const express = require('express');
const axios   = require('axios');
const db = require('../db-adapter');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/routes/latest
router.get('/latest', authenticate, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const routes = await db.findLatestRoutes(req.query.zone || null, limit);
    res.json({ routes, count: routes.length });
  } catch (err) {
    console.error('[routes] GET latest error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/routes/optimize
router.post('/optimize', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { algorithm = 'pso', zones = [] } = req.body;

    let optimResult;
    try {
      const r = await axios.post(`${process.env.OPTIMIZATION_SERVICE_URL}/optimize`, { algorithm, zones }, { timeout: 120000 });
      optimResult = r.data;
    } catch (err) {
      return res.status(502).json({ error: 'Optimization service unavailable.', detail: err.message });
    }

    const routeIds = [];
    for (const r of optimResult) {
      const id = await db.createRoute({
        zone:                r.zone,
        route_order:         r.route_order,
        total_distance_km:   r.total_distance_km,
        algorithm_used:      r.algorithm_used,
        improvement_percent: parseFloat((r.qaoa_vs_pso_improvement || '0').replace('%', '')) || 0,
        generated_at:        r.generated_at,
      });
      routeIds.push(id);
    }

    res.json({ message: 'Route optimisation completed.', routes_generated: routeIds.length, route_ids: routeIds, raw_result: optimResult });
  } catch (err) {
    console.error('[routes] optimize error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
