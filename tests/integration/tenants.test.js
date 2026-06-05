const request = require('supertest');

const ADMIN_KEY = 'test-admin-key-12345';

let app;

const { setupDatabase, cleanDatabase, teardownDatabase, TEST_DB_URL } = require('./setup');

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  await setupDatabase();
  app = require('../../src/app');
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  const pool = require('../../src/db/pool');
  await pool.end();
  await teardownDatabase();
});

describe('POST /api/tenants', () => {
  it('creates a tenant and returns api_key', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ name: 'my-app' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('my-app');
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.api_key).toMatch(/^sk_commently_/);
  });

  it('rejects duplicate tenant name', async () => {
    await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ name: 'dup-app' });

    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ name: 'dup-app' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects missing name', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects without admin auth', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .send({ name: 'no-auth' });

    expect(res.status).toBe(401);
  });

  it('rejects with wrong admin key', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', 'Bearer wrong-key')
      .send({ name: 'bad-key' });

    expect(res.status).toBe(401);
  });

  it('rejects with malformed Authorization header', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', 'Token abc')
      .send({ name: 'bad-header' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/tenants/:id/rotate-key', () => {
  it('rotates api key for existing tenant', async () => {
    const createRes = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ name: 'rotate-app' });

    const tenantId = createRes.body.data.id;
    const oldKey = createRes.body.data.api_key;

    const rotateRes = await request(app)
      .post(`/api/tenants/${tenantId}/rotate-key`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.data.api_key).toMatch(/^sk_commently_/);
    expect(rotateRes.body.data.api_key).not.toBe(oldKey);
  });

  it('old key stops working after rotation', async () => {
    const createRes = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ name: 'rotate-test' });

    const oldKey = createRes.body.data.api_key;
    const tenantId = createRes.body.data.id;

    await request(app)
      .post(`/api/tenants/${tenantId}/rotate-key`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    const res = await request(app)
      .get('/api/comments?resource_id=test')
      .set('X-API-Key', oldKey);

    expect(res.status).toBe(401);
  });

  it('new key works after rotation', async () => {
    const createRes = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ name: 'rotate-test-2' });

    const tenantId = createRes.body.data.id;

    const rotateRes = await request(app)
      .post(`/api/tenants/${tenantId}/rotate-key`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    const newKey = rotateRes.body.data.api_key;

    const res = await request(app)
      .get('/api/comments?resource_id=test')
      .set('X-API-Key', newKey);

    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent tenant', async () => {
    const res = await request(app)
      .post('/api/tenants/00000000-0000-0000-0000-000000000000/rotate-key')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.status).toBe(404);
  });
});
