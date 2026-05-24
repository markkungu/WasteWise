const express = require('express');
const db = require('../db-adapter');
const { authenticate, requireRole } = require('../middleware/auth');
const blockchain = require('../blockchain');

const router = express.Router();

// GET /api/rewards
router.get('/', authenticate, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const { items, total, totals } = await db.findRewardsByUser(req.user.user_id, page, limit);
    res.json({
      rewards: items,
      totals: {
        total_earned:   parseFloat(totals.total_earned   || 0).toFixed(6),
        total_received: parseFloat(totals.total_received || 0).toFixed(6),
        total_pending:  parseFloat(totals.total_pending  || 0).toFixed(6),
      },
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[rewards] GET error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/rewards/release
router.post('/release', authenticate, requireRole('company', 'admin'), async (req, res) => {
  try {
    const { submission_id } = req.body;
    if (!submission_id) return res.status(400).json({ error: 'submission_id is required.' });

    const reward = await db.findRewardBySubmission(submission_id, 'PARTIAL');
    if (!reward) return res.status(404).json({ error: 'No PARTIAL reward found for this submission.' });

    let txHash;
    try { txHash = await blockchain.releaseFinalReward(submission_id); }
    catch (err) { return res.status(502).json({ error: 'Blockchain error.', detail: err.message }); }

    await db.updateReward(submission_id, { status: 'COMPLETED', tx_hash: txHash });
    res.json({ message: 'Final reward released successfully.', submission_id, pending_amount: parseFloat(reward.pending_amount || 0).toFixed(6), tx_hash: txHash });
  } catch (err) {
    console.error('[rewards] release error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/rewards/batch-claim
router.post('/batch-claim', authenticate, requireRole('company', 'admin'), async (req, res) => {
  try {
    const { center_id, submission_ids, weights_grams } = req.body;
    if (!center_id || !Array.isArray(submission_ids) || !Array.isArray(weights_grams))
      return res.status(400).json({ error: 'center_id, submission_ids[], and weights_grams[] are required.' });
    if (submission_ids.length !== weights_grams.length)
      return res.status(400).json({ error: 'submission_ids and weights_grams must be the same length.' });

    const subs = await db.findSubmissionsByIds(submission_ids);
    for (const sid of submission_ids) {
      const sub = subs.find(s => s.id === sid);
      if (!sub || sub.verification_status !== 'APPROVED')
        return res.status(400).json({ error: `Submission ${sid} is not APPROVED.` });
    }

    let txHash;
    try { txHash = await blockchain.batchIssueRewards(center_id, submission_ids, weights_grams); }
    catch (err) { return res.status(502).json({ error: 'Blockchain error.', detail: err.message }); }

    res.json({ message: 'Batch rewards issued successfully.', center_id, submissions_processed: submission_ids.length, tx_hash: txHash });
  } catch (err) {
    console.error('[rewards] batch-claim error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
