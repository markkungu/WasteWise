const request = require('supertest');
const app = require('../app');
const dbMemory = require('../db-memory');

beforeAll(() => {
  delete process.env.DATABASE_URL;
  process.env.JWT_SECRET = 'test-secret-for-jest';
});

beforeEach(() => {
  dbMemory.store.users = [];
  dbMemory.store.submissions = [];
  dbMemory.store.rewards = [];
  dbMemory.store.verification = [];
});

async function adminToken() {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Admin', email: 'admin@example.com', password: 'pass', role: 'admin',
  });
  return res.body.token;
}

async function userToken() {
  const res = await request(app).post('/api/auth/register').send({
    name: 'User', email: 'user@example.com', password: 'pass',
  });
  return res.body.token;
}

describe('GET /api/analytics/dashboard', () => {
  it('returns dashboard with zero counts on empty store (admin)', async () => {
    const token = await adminToken();
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('submissions');
    expect(res.body).toHaveProperty('rewards');
    expect(Number(res.body.submissions.total_submissions)).toBe(0);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/analytics/dashboard');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/analytics/heatmap', () => {
  it('returns points array for authenticated user', async () => {
    const token = await userToken();
    const res = await request(app)
      .get('/api/analytics/heatmap')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('points');
    expect(Array.isArray(res.body.points)).toBe(true);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/analytics/heatmap');
    expect(res.status).toBe(401);
  });
});
