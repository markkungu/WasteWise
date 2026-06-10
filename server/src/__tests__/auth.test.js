const request = require('supertest');
const app = require('../app');
const dbMemory = require('../db-memory');

// Reset in-memory store before each test to prevent state bleed
beforeEach(() => {
  dbMemory.store.users = [];
  dbMemory.store.submissions = [];
  dbMemory.store.rewards = [];
  dbMemory.store.verification = [];
  dbMemory.store.routes = [];
});

// Ensure DATABASE_URL is unset so tests use the in-memory DB
beforeAll(() => {
  delete process.env.DATABASE_URL;
  process.env.JWT_SECRET = 'test-secret-for-jest';
});

describe('POST /api/auth/register', () => {
  it('creates a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects registration with missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Alice', email: 'alice@example.com', password: 'abc123',
    });
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice2', email: 'alice@example.com', password: 'abc123',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('defaults role to user when not specified', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Bob', email: 'bob@example.com', password: 'pass',
    });
    expect(res.body.user.role).toBe('user');
  });

  it('accepts company role', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Corp', email: 'corp@example.com', password: 'pass', role: 'company',
    });
    expect(res.body.user.role).toBe('company');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Alice', email: 'alice@example.com', password: 'password123',
    });
  });

  it('returns a token for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com', password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com', password: 'wrongpass',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('rejects unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com', password: 'pass',
    });
    expect(res.status).toBe(401);
  });

  it('rejects request with missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'alice@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/profile', () => {
  let token;
  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice', email: 'alice@example.com', password: 'password123',
    });
    token = res.body.token;
  });

  it('returns profile for authenticated user', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects request without token', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer badtoken');
    expect(res.status).toBe(401);
  });
});
