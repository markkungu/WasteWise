const express = require('express');
const multer  = require('multer');
const path    = require('path');
const crypto  = require('crypto');
const axios   = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../db-adapter');
const { authenticate } = require('../middleware/auth');
const blockchain = require('../blockchain');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '..', '..', 'uploads'), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/submissions
router.post('/', authenticate, upload.single('image'), async (req, res) => {
  try {
    const { latitude, longitude, reported_weight_kg, waste_type, center_id } = req.body;
    const image_url = req.body.image_url || (req.file ? `/uploads/${req.file.filename}` : null);
    if (!image_url || !latitude || !longitude)
      return res.status(400).json({ error: 'image_url (or image file), latitude, and longitude are required.' });

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
      return res.status(400).json({ error: 'latitude and longitude must be valid coordinates.' });

    if (reported_weight_kg !== undefined) {
      const w = parseFloat(reported_weight_kg);
      if (isNaN(w) || w <= 0 || w > 10000)
        return res.status(400).json({ error: 'reported_weight_kg must be a positive number no greater than 10000.' });
    }

    if (center_id) {
      const company = await db.findCompanyById(parseInt(center_id));
      if (!company)
        return res.status(400).json({ error: `Recycling center ${center_id} does not exist.` });
    }

    const submissionId = uuidv4();
    const submission = await db.createSubmission({
      id:                       submissionId,
      user_id:                  req.user.user_id,
      image_url,
      latitude:                 lat,
      longitude:                lng,
      reported_weight_kg:       reported_weight_kg ? parseFloat(reported_weight_kg) : null,
      waste_type:               waste_type || null,
      verification_status:      'PENDING',
      weight_validation_status: 'PENDING',
      submission_hash:          '0x' + crypto.createHash('sha256').update(image_url + submissionId).digest('hex'),
      center_id:                center_id ? parseInt(center_id) : null,
    });

    // Call AI service
    let verif;
    try {
      const r = await axios.post(`${process.env.ML_SERVICE_URL}/predict`, {
        submission_id: submissionId,
        image_url,
        center_id:  center_id ? parseInt(center_id) : null,
        latitude:   lat,
        longitude:  lng,
        timestamp:  new Date().toISOString(),
      }, { timeout: 30000 });
      verif = r.data;
    } catch (err) {
      console.warn('[submissions] AI service unavailable:', err.message);
      return res.status(202).json({ message: 'Submission received. Verification pending.', submission_id: submissionId, status: 'PENDING' });
    }

    const isApproved = verif.verification_result === 'APPROVED';
    await db.updateSubmissionStatus(
      submissionId,
      isApproved ? 'APPROVED' : 'REJECTED',
      isApproved ? 'VALIDATED' : 'REJECTED'
    );
    await db.createVerification({
      id:                   uuidv4(),
      submission_id:        submissionId,
      verification_result:  verif.verification_result,
      primary_category:     verif.primary_category,
      detected_items_count: verif.detected_items_count,
      confidence_score:     verif.confidence_score,
      authenticity_verified:verif.authenticity_verified,
      fraud_flags:          verif.fraud_flags,
      model_version:        verif.model_version,
    });

    if (!isApproved)
      return res.status(201).json({ message: 'Submission rejected.', submission_id: submissionId, ...verif, reward: null });

    // Issue blockchain reward
    const weightGrams = reported_weight_kg ? Math.round(parseFloat(reported_weight_kg) * 1000) : 500;
    const user = await db.findUserById(req.user.user_id);
    const recipientAddress = user?.wallet_address || '0x0000000000000000000000000000000000000001';
    let txHash;
    try { txHash = await blockchain.issuePartialReward(submissionId, recipientAddress, weightGrams); }
    catch (err) { txHash = '0x_blockchain_error'; }

    const { total, immediate, pending } = blockchain.calculateReward(weightGrams);
    await db.createReward({
      id:               uuidv4(),
      user_id:          req.user.user_id,
      submission_id:    submissionId,
      token_amount:     total,
      immediate_amount: immediate,
      pending_amount:   pending,
      status:           'PARTIAL',
      tx_hash:          txHash,
    });

    res.status(201).json({ message: 'Submission approved and reward issued.', submission_id: submissionId, ...verif, reward: { token_amount: Math.round(immediate), tx_hash: txHash } });
  } catch (err) {
    console.error('[submissions] POST error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/submissions
router.get('/', authenticate, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const { items, total } = await db.findSubmissionsByUser(req.user.user_id, page, limit);
    res.json({ submissions: items, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[submissions] GET error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/submissions/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const submission = await db.findSubmissionById(req.params.id, req.user.user_id);
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    res.json({ submission });
  } catch (err) {
    console.error('[submissions] GET/:id error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
