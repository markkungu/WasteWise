const request = require('supertest');
const app = require('../app');

describe('GET /health', () => {
  it('returns 200 with ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('wastewise-api');
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns 404 for unknown endpoints', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Endpoint not found.');
  });
});
