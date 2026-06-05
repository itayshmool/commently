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

describe('GET /api/tenants', () => {
  it('returns empty list when no tenants', async () => {
    const res = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('lists all tenants with key prefix', async () => {
    await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'app-a' });
    await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'app-b' });

    const res = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].api_key_prefix).toBeDefined();
    expect(res.body.data[0].name).toBeDefined();
    expect(res.body.data[0].id).toBeDefined();
    expect(res.body.data[0].api_key_hash).toBeUndefined();
  });

  it('does not expose api_key or api_key_hash', async () => {
    await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'secret-app' });

    const res = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.body.data[0].api_key).toBeUndefined();
    expect(res.body.data[0].api_key_hash).toBeUndefined();
  });

  it('returns tenants in reverse chronological order', async () => {
    await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'first' });
    await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'second' });

    const res = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.body.data[0].name).toBe('second');
    expect(res.body.data[1].name).toBe('first');
  });

  it('rejects without admin auth', async () => {
    const res = await request(app).get('/api/tenants');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/tenants/:id/stats', () => {
  it('returns stats for a tenant with comments', async () => {
    const tenant = await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'stats-app' });
    const apiKey = tenant.body.data.api_key;
    const tenantId = tenant.body.data.id;

    await request(app).post('/api/comments').set('X-API-Key', apiKey).send({
      resource_id: 'res-1', author_id: 'u1', author_name: 'Alice', body: 'Hello',
    });
    await request(app).post('/api/comments').set('X-API-Key', apiKey).send({
      resource_id: 'res-2', author_id: 'u2', author_name: 'Bob', body: 'World',
    });

    const res = await request(app)
      .get(`/api/tenants/${tenantId}/stats`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('stats-app');
    expect(res.body.data.stats.total_comments).toBe(2);
    expect(res.body.data.stats.total_resources).toBe(2);
    expect(res.body.data.stats.deleted_comments).toBe(0);
    expect(res.body.data.recent_comments).toHaveLength(2);
  });

  it('counts deleted comments', async () => {
    const tenant = await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'del-app' });
    const apiKey = tenant.body.data.api_key;
    const tenantId = tenant.body.data.id;

    const c = await request(app).post('/api/comments').set('X-API-Key', apiKey).send({
      resource_id: 'res-1', author_id: 'u1', author_name: 'Alice', body: 'Delete me',
    });
    await request(app).delete(`/api/comments/${c.body.data.id}`).set('X-API-Key', apiKey);

    const res = await request(app)
      .get(`/api/tenants/${tenantId}/stats`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.body.data.stats.total_comments).toBe(1);
    expect(res.body.data.stats.deleted_comments).toBe(1);
  });

  it('returns empty stats for tenant with no comments', async () => {
    const tenant = await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'empty-app' });
    const tenantId = tenant.body.data.id;

    const res = await request(app)
      .get(`/api/tenants/${tenantId}/stats`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.body.data.stats.total_comments).toBe(0);
    expect(res.body.data.stats.total_resources).toBe(0);
    expect(res.body.data.recent_comments).toHaveLength(0);
  });

  it('returns 404 for non-existent tenant', async () => {
    const res = await request(app)
      .get('/api/tenants/00000000-0000-0000-0000-000000000000/stats')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.status).toBe(404);
  });

  it('rejects without admin auth', async () => {
    const res = await request(app).get('/api/tenants/some-id/stats');
    expect(res.status).toBe(401);
  });

  it('excludes deleted comments from recent list', async () => {
    const tenant = await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN_KEY}`).send({ name: 'recent-app' });
    const apiKey = tenant.body.data.api_key;
    const tenantId = tenant.body.data.id;

    const c = await request(app).post('/api/comments').set('X-API-Key', apiKey).send({
      resource_id: 'res-1', author_id: 'u1', author_name: 'Alice', body: 'Visible',
    });
    const d = await request(app).post('/api/comments').set('X-API-Key', apiKey).send({
      resource_id: 'res-1', author_id: 'u1', author_name: 'Alice', body: 'Deleted',
    });
    await request(app).delete(`/api/comments/${d.body.data.id}`).set('X-API-Key', apiKey);

    const res = await request(app)
      .get(`/api/tenants/${tenantId}/stats`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.body.data.recent_comments).toHaveLength(1);
    expect(res.body.data.recent_comments[0].body).toBe('Visible');
  });
});
