/**
 * db-adapter.js — Unified async data access layer.
 * Routes every call to PostgreSQL (when DATABASE_URL is set) or the in-memory store.
 */

const db = require('./db');

function isPg() { return !!process.env.DATABASE_URL; }
function mem()  { return db.store; }
function save() { if (!isPg() && db.save) db.save(); }

// ---- Users ------------------------------------------------------------------

async function findUserByEmail(email) {
  if (isPg()) {
    const { rows } = await db.query(
      'SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = $1',
      [email.toLowerCase()]
      

      
    );
    return rows[0] || null;
  }
  return mem().users.find(u => u.email === email.toLowerCase()) || null;
}

async function findUserById(id) {
  if (isPg()) {
    const { rows } = await db.query(
      'SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1',
      [id]
    );
    return rows[0] || null;
  }
  return mem().users.find(u => u.id === id) || null;
}

async function createUser({ id, name, email, password_hash, role, wallet_address }) {
  if (isPg()) {
    const { rows } = await db.query(
      `INSERT INTO users (id, name, email, password_hash, role_id, wallet_address)
       VALUES ($1, $2, $3, $4, (SELECT id FROM roles WHERE name=$5), $6)
       RETURNING *, (SELECT name FROM roles WHERE id = role_id) AS role`,
      [id, name, email.toLowerCase(), password_hash, role, wallet_address || null]
    );
    return rows[0];
  }
  const user = {
    id, name, email: email.toLowerCase(), password_hash, role,
    wallet_address: wallet_address || null,
    is_assisted_collector: false, collector_code: null, center_id: null,
    created_at: new Date().toISOString(),
  };
  mem().users.push(user);
  save();
  return user;
}

// ---- Submissions ------------------------------------------------------------

async function createSubmission(sub) {
  if (isPg()) {
    const { rows } = await db.query(
      `INSERT INTO plastic_submissions
         (id, user_id, image_url, latitude, longitude, reported_weight_kg,
          waste_type, verification_status, weight_validation_status, submission_hash, center_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [sub.id, sub.user_id, sub.image_url, sub.latitude, sub.longitude,
       sub.reported_weight_kg, sub.waste_type, sub.verification_status,
       sub.weight_validation_status, sub.submission_hash, sub.center_id]
    );
    return rows[0];
  }
  mem().submissions.push(sub);
  save();
  return sub;
}

async function updateSubmissionStatus(id, verification_status, weight_validation_status) {
  if (isPg()) {
    if (weight_validation_status !== undefined) {
      await db.query(
        'UPDATE plastic_submissions SET verification_status=$1, weight_validation_status=$2 WHERE id=$3',
        [verification_status, weight_validation_status, id]
      );
    } else {
      await db.query('UPDATE plastic_submissions SET verification_status=$1 WHERE id=$2', [verification_status, id]);
    }
    return;
  }
  const s = mem().submissions.find(s => s.id === id);
  if (s) {
    s.verification_status = verification_status;
    if (weight_validation_status !== undefined) s.weight_validation_status = weight_validation_status;
    save();
  }
}

async function findSubmissionsByUser(user_id, page, limit) {
  if (isPg()) {
    const offset = (page - 1) * limit;
    const { rows } = await db.query(
      `SELECT s.*, v.verification_result, v.confidence_score, v.fraud_flags, v.model_version
       FROM plastic_submissions s LEFT JOIN verification v ON v.submission_id = s.id
       WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT $2 OFFSET $3`,
      [user_id, limit, offset]
    );
    const { rows: cnt } = await db.query(
      'SELECT COUNT(*) FROM plastic_submissions WHERE user_id=$1', [user_id]
    );
    return { items: rows, total: parseInt(cnt[0].count) };
  }
  const all = mem().submissions
    .filter(s => s.user_id === user_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const items = all.slice((page - 1) * limit, page * limit).map(s => {
    const v = mem().verification.find(v => v.submission_id === s.id);
    return { ...s, ...(v ? { verification_result: v.verification_result, confidence_score: v.confidence_score, fraud_flags: v.fraud_flags, model_version: v.model_version } : {}) };
  });
  return { items, total: all.length };
}

async function findSubmissionById(id, user_id) {
  if (isPg()) {
    const { rows } = await db.query(
      `SELECT s.*, v.verification_result, v.confidence_score, v.fraud_flags, v.model_version,
              v.primary_category, v.detected_items_count, v.authenticity_verified,
              r.token_amount, r.immediate_amount, r.pending_amount,
              r.status AS reward_status, r.tx_hash
       FROM plastic_submissions s
       LEFT JOIN verification v ON v.submission_id = s.id
       LEFT JOIN rewards r ON r.submission_id = s.id
       WHERE s.id=$1 AND s.user_id=$2`,
      [id, user_id]
    );
    return rows[0] || null;
  }
  const s = mem().submissions.find(s => s.id === id && s.user_id === user_id);
  if (!s) return null;
  const v = mem().verification.find(v => v.submission_id === id);
  const r = mem().rewards.find(r => r.submission_id === id);
  return {
    ...s, ...v,
    ...(r ? { token_amount: r.token_amount, immediate_amount: r.immediate_amount,
               pending_amount: r.pending_amount, reward_status: r.status, tx_hash: r.tx_hash } : {}),
  };
}

async function findSubmissionsByIds(ids) {
  if (isPg()) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await db.query(
      `SELECT * FROM plastic_submissions WHERE id IN (${placeholders})`, ids
    );
    return rows;
  }
  return mem().submissions.filter(s => ids.includes(s.id));
}

// ---- Verification -----------------------------------------------------------

async function createVerification(verif) {
  if (isPg()) {
    await db.query(
      `INSERT INTO verification
         (id, submission_id, verification_result, primary_category,
          detected_items_count, confidence_score, authenticity_verified, fraud_flags, model_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [verif.id, verif.submission_id, verif.verification_result, verif.primary_category,
       verif.detected_items_count, verif.confidence_score, verif.authenticity_verified,
       JSON.stringify(verif.fraud_flags), verif.model_version]
    );
    return;
  }
  mem().verification.push(verif);
  save();
}

// ---- Rewards ----------------------------------------------------------------

async function createReward(reward) {
  if (isPg()) {
    await db.query(
      `INSERT INTO rewards (id, user_id, submission_id, token_amount, immediate_amount, pending_amount, status, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reward.id, reward.user_id, reward.submission_id, reward.token_amount,
       reward.immediate_amount, reward.pending_amount, reward.status, reward.tx_hash]
    );
    return;
  }
  mem().rewards.push(reward);
  save();
}

async function findRewardsByUser(user_id, page, limit) {
  if (isPg()) {
    const offset = (page - 1) * limit;
    const { rows } = await db.query(
      `SELECT r.*, s.image_url, s.waste_type, s.reported_weight_kg
       FROM rewards r LEFT JOIN plastic_submissions s ON s.id = r.submission_id
       WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      [user_id, limit, offset]
    );
    const { rows: agg } = await db.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(token_amount),     0) AS total_earned,
              COALESCE(SUM(immediate_amount), 0) AS total_received,
              COALESCE(SUM(pending_amount),   0) AS total_pending
       FROM rewards WHERE user_id=$1`,
      [user_id]
    );
    return { items: rows, total: parseInt(agg[0].total), totals: agg[0] };
  }
  const all = mem().rewards
    .filter(r => r.user_id === user_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const items = all.slice((page - 1) * limit, page * limit).map(r => {
    const s = mem().submissions.find(s => s.id === r.submission_id);
    return { ...r, image_url: s?.image_url, waste_type: s?.waste_type, reported_weight_kg: s?.reported_weight_kg };
  });
  const t = all.reduce((acc, r) => ({
    total_earned:   acc.total_earned   + (r.token_amount     || 0),
    total_received: acc.total_received + (r.immediate_amount || 0),
    total_pending:  acc.total_pending  + (r.pending_amount   || 0),
  }), { total_earned: 0, total_received: 0, total_pending: 0 });
  return { items, total: all.length, totals: { total: String(all.length), ...t } };
}

async function findRewardBySubmission(submission_id, status) {
  if (isPg()) {
    const params = status !== undefined
      ? ['SELECT * FROM rewards WHERE submission_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT 1', [submission_id, status]]
      : ['SELECT * FROM rewards WHERE submission_id=$1 ORDER BY created_at DESC LIMIT 1', [submission_id]];
    const { rows } = await db.query(...params);
    return rows[0] || null;
  }
  const matches = mem().rewards.filter(r =>
    r.submission_id === submission_id && (status === undefined || r.status === status)
  );
  return matches[matches.length - 1] || null;
}

async function updateReward(submission_id, { status, tx_hash }) {
  if (isPg()) {
    await db.query(
      'UPDATE rewards SET status=$1, tx_hash=$2 WHERE submission_id=$3', [status, tx_hash, submission_id]
    );
    return;
  }
  const r = mem().rewards.find(r => r.submission_id === submission_id);
  if (r) { r.status = status; r.tx_hash = tx_hash; save(); }
}

// ---- Recycling Companies ----------------------------------------------------

async function findCompanyById(id) {
  if (isPg()) {
    const { rows } = await db.query('SELECT * FROM recycling_companies WHERE id=$1', [id]);
    return rows[0] || null;
  }
  // In-memory mode has no companies table; treat any numeric id as valid for dev
  return id ? { id } : null;
}

// ---- Routes -----------------------------------------------------------------

async function findLatestRoutes(zone, limit) {
  if (isPg()) {
    if (zone) {
      const { rows } = await db.query(
        'SELECT * FROM optimized_routes WHERE zone ILIKE $1 ORDER BY generated_at DESC LIMIT $2',
        [`%${zone}%`, limit]
      );
      return rows;
    }
    const { rows } = await db.query(
      'SELECT * FROM optimized_routes ORDER BY generated_at DESC LIMIT $1', [limit]
    );
    return rows;
  }
  let routes = [...mem().routes].sort((a, b) => (b.generated_at || '').localeCompare(a.generated_at || ''));
  if (zone) routes = routes.filter(r => r.zone?.includes(zone));
  return routes.slice(0, limit);
}

async function createRoute(route) {
  if (isPg()) {
    const { rows } = await db.query(
      `INSERT INTO optimized_routes
         (zone, route_order, total_distance_km, algorithm_used, improvement_percent, generated_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [route.zone, JSON.stringify(route.route_order), route.total_distance_km,
       route.algorithm_used, route.improvement_percent, route.generated_at]
    );
    return rows[0].id;
  }
  const id = ++mem()._seq.routes;
  mem().routes.push({ ...route, id });
  save();
  return id;
}

// ---- Analytics --------------------------------------------------------------

async function getAnalyticsDashboard() {
  if (isPg()) {
    const { rows: [subStats] } = await db.query(
      `SELECT COUNT(*)::int AS total_submissions,
              COUNT(*) FILTER (WHERE verification_status='APPROVED')::int AS approved,
              COUNT(*) FILTER (WHERE verification_status='PENDING')::int  AS pending,
              COALESCE(SUM(reported_weight_kg), 0) AS total_weight_kg
       FROM plastic_submissions`
    );
    const { rows: [rewStats] } = await db.query(
      `SELECT COALESCE(SUM(token_amount),     0) AS total_tokens_issued,
              COALESCE(SUM(immediate_amount), 0) AS total_tokens_distributed,
              COUNT(DISTINCT user_id)::int       AS unique_recipients
       FROM rewards`
    );
    const { rows: topNeighborhoods } = await db.query(
      `SELECT ROUND(latitude::numeric,  2) AS lat_bucket,
              ROUND(longitude::numeric, 2) AS lng_bucket,
              COUNT(*)::int                AS submission_count,
              COALESCE(SUM(reported_weight_kg), 0) AS total_weight_kg
       FROM plastic_submissions WHERE verification_status='APPROVED'
       GROUP BY lat_bucket, lng_bucket
       ORDER BY submission_count DESC LIMIT 10`
    );
    const { rows: recentActivity } = await db.query(
      `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::text AS submissions
       FROM plastic_submissions GROUP BY date ORDER BY date DESC LIMIT 30`
    );
    return { submissions: subStats, rewards: rewStats, top_neighborhoods: topNeighborhoods, recent_activity: recentActivity };
  }

  const subs = mem().submissions;
  const rews = mem().rewards;
  const submissions = {
    total_submissions: subs.length,
    approved:          subs.filter(s => s.verification_status === 'APPROVED').length,
    pending:           subs.filter(s => s.verification_status === 'PENDING').length,
    total_weight_kg:   subs.reduce((acc, s) => acc + (s.reported_weight_kg || 0), 0).toFixed(3),
  };
  const rewards = {
    total_tokens_issued:      rews.reduce((a, r) => a + (r.token_amount     || 0), 0).toFixed(6),
    total_tokens_distributed: rews.reduce((a, r) => a + (r.immediate_amount || 0), 0).toFixed(6),
    unique_recipients:        new Set(rews.map(r => r.user_id)).size,
  };
  const buckets = {};
  subs.filter(s => s.verification_status === 'APPROVED').forEach(s => {
    const key = `${(s.latitude || 0).toFixed(2)},${(s.longitude || 0).toFixed(2)}`;
    if (!buckets[key]) buckets[key] = { lat_bucket: parseFloat((s.latitude || 0).toFixed(2)), lng_bucket: parseFloat((s.longitude || 0).toFixed(2)), submission_count: 0, total_weight_kg: 0 };
    buckets[key].submission_count++;
    buckets[key].total_weight_kg += s.reported_weight_kg || 0;
  });
  const dailyCounts = {};
  subs.forEach(s => {
    const day = (s.created_at || '').slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  });
  return {
    submissions,
    rewards,
    top_neighborhoods: Object.values(buckets).sort((a, b) => b.submission_count - a.submission_count).slice(0, 10),
    recent_activity: Object.entries(dailyCounts).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30).map(([date, n]) => ({ date, submissions: String(n) })),
  };
}

async function getHeatmapData(status, limit) {
  if (isPg()) {
    const { rows } = await db.query(
      `SELECT latitude, longitude, COALESCE(reported_weight_kg, 0.5) AS weight, waste_type
       FROM plastic_submissions WHERE verification_status=$1 LIMIT $2`,
      [status, limit]
    );
    return rows;
  }
  return mem().submissions
    .filter(s => s.verification_status === status)
    .slice(0, limit)
    .map(s => ({ latitude: s.latitude, longitude: s.longitude, weight: s.reported_weight_kg || 0.5, waste_type: s.waste_type }));
}

async function getTrendsData(cutoff, granularity) {
  if (isPg()) {
    const fmt = granularity === 'week' ? 'IYYY-"W"IW' : 'YYYY-MM-DD';
    const { rows: subTrends } = await db.query(
      `SELECT TO_CHAR(created_at, '${fmt}') AS period,
              COUNT(*)::int AS total_submissions,
              COUNT(*) FILTER (WHERE verification_status='APPROVED')::int AS approved,
              COALESCE(SUM(reported_weight_kg), 0) AS total_weight_kg
       FROM plastic_submissions WHERE created_at >= $1
       GROUP BY period ORDER BY period`,
      [cutoff]
    );
    const { rows: rewTrends } = await db.query(
      `SELECT TO_CHAR(created_at, '${fmt}') AS period,
              COUNT(*)::int AS rewards_issued,
              COALESCE(SUM(token_amount), 0) AS tokens_issued
       FROM rewards WHERE created_at >= $1
       GROUP BY period ORDER BY period`,
      [cutoff]
    );
    const { rows: catBreakdown } = await db.query(
      `SELECT waste_type, COUNT(*)::int AS count,
              COALESCE(SUM(reported_weight_kg), 0) AS total_weight_kg
       FROM plastic_submissions WHERE waste_type IS NOT NULL
       GROUP BY waste_type ORDER BY count DESC`
    );
    return { subTrends, rewTrends, catBreakdown };
  }

  const periodKey = (iso) => {
    if (granularity === 'week') {
      const d = new Date(iso);
      const wn = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / (7 * 86400000));
      return `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
    }
    return iso.slice(0, 10);
  };
  const subsByPeriod = {};
  mem().submissions.filter(s => s.created_at >= cutoff).forEach(s => {
    const p = periodKey(s.created_at);
    if (!subsByPeriod[p]) subsByPeriod[p] = { period: p, total_submissions: 0, approved: 0, total_weight_kg: 0 };
    subsByPeriod[p].total_submissions++;
    if (s.verification_status === 'APPROVED') subsByPeriod[p].approved++;
    subsByPeriod[p].total_weight_kg += s.reported_weight_kg || 0;
  });
  const rewsByPeriod = {};
  mem().rewards.filter(r => r.created_at >= cutoff).forEach(r => {
    const p = periodKey(r.created_at);
    if (!rewsByPeriod[p]) rewsByPeriod[p] = { period: p, rewards_issued: 0, tokens_issued: 0 };
    rewsByPeriod[p].rewards_issued++;
    rewsByPeriod[p].tokens_issued += r.token_amount || 0;
  });
  const catBreakdown = {};
  mem().submissions.filter(s => s.waste_type).forEach(s => {
    if (!catBreakdown[s.waste_type]) catBreakdown[s.waste_type] = { waste_type: s.waste_type, count: 0, total_weight_kg: 0 };
    catBreakdown[s.waste_type].count++;
    catBreakdown[s.waste_type].total_weight_kg += s.reported_weight_kg || 0;
  });
  return {
    subTrends: Object.values(subsByPeriod).sort((a, b) => a.period.localeCompare(b.period)),
    rewTrends: Object.values(rewsByPeriod).sort((a, b) => a.period.localeCompare(b.period)),
    catBreakdown: Object.values(catBreakdown).sort((a, b) => b.count - a.count),
  };
}

module.exports = {
  findUserByEmail, findUserById, createUser,
  createSubmission, updateSubmissionStatus, findSubmissionsByUser, findSubmissionById, findSubmissionsByIds,
  createVerification,
  createReward, findRewardsByUser, findRewardBySubmission, updateReward,
  findCompanyById,
  findLatestRoutes, createRoute,
  getAnalyticsDashboard, getHeatmapData, getTrendsData,
};
