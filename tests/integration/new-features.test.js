const request = require('supertest');

const ADMIN_KEY = 'test-admin-key-12345';

let app, apiKey, tenantId;

const { setupDatabase, cleanDatabase, teardownDatabase, TEST_DB_URL } = require('./setup');

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.COMMENT_EDIT_WINDOW_MINUTES = '15';
  await setupDatabase();
  app = require('../../src/app');
});

beforeEach(async () => {
  await cleanDatabase();
  const res = await request(app)
    .post('/api/tenants')
    .set('Authorization', `Bearer ${ADMIN_KEY}`)
    .send({ name: 'test-app' });
  apiKey = res.body.data.api_key;
  tenantId = res.body.data.id;
});

afterAll(async () => {
  const pool = require('../../src/db/pool');
  await pool.end();
  await teardownDatabase();
});

function createComment(overrides = {}) {
  return request(app)
    .post('/api/comments')
    .set('X-API-Key', apiKey)
    .send({
      resource_id: 'post-1',
      author_id: 'user@example.com',
      author_name: 'Alice',
      body: 'Test comment',
      ...overrides,
    });
}

// ── DELETE TENANT ──

describe('DELETE /api/tenants/:id', () => {
  it('deletes a tenant and all its comments', async () => {
    await createComment();

    const res = await request(app)
      .delete(`/api/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const listRes = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(listRes.body.data).toHaveLength(0);
  });

  it('returns 404 for non-existent tenant', async () => {
    const res = await request(app)
      .delete('/api/tenants/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(404);
  });

  it('rejects without admin auth', async () => {
    const res = await request(app).delete(`/api/tenants/${tenantId}`);
    expect(res.status).toBe(401);
  });
});

// ── X-AUTHOR-ID AUDIT ──

describe('DELETE /api/comments/:id with X-Author-Id', () => {
  it('records deleted_by from X-Author-Id header', async () => {
    const c = await createComment();
    const res = await request(app)
      .delete(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey)
      .set('X-Author-Id', 'admin@example.com');

    expect(res.status).toBe(200);
    expect(res.body.data.deleted_by).toBe('admin@example.com');
  });

  it('deleted_by is null when X-Author-Id not provided', async () => {
    const c = await createComment();
    const res = await request(app)
      .delete(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey);

    expect(res.body.data.deleted_by).toBeNull();
  });
});

// ── COMMENT EDITING ──

describe('PATCH /api/comments/:id', () => {
  it('edits a comment within the time window', async () => {
    const c = await createComment({ body: 'Original' });
    const res = await request(app)
      .patch(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', body: 'Edited body' });

    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe('Edited body');
    expect(res.body.data.edited_at).toBeDefined();
  });

  it('rejects edit by non-author', async () => {
    const c = await createComment();
    const res = await request(app)
      .patch(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'other@example.com', body: 'Hack!' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects edit on deleted comment', async () => {
    const c = await createComment();
    await request(app)
      .delete(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey);

    const res = await request(app)
      .patch(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', body: 'Edit deleted' });

    expect(res.status).toBe(404);
  });

  it('rejects edit on non-existent comment', async () => {
    const res = await request(app)
      .patch('/api/comments/00000000-0000-0000-0000-000000000000')
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', body: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('rejects missing author_id', async () => {
    const c = await createComment();
    const res = await request(app)
      .patch(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey)
      .send({ body: 'No author' });

    expect(res.status).toBe(400);
  });

  it('rejects empty body', async () => {
    const c = await createComment();
    const res = await request(app)
      .patch(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', body: '' });

    expect(res.status).toBe(400);
  });

  it('rejects body over 5000 chars', async () => {
    const c = await createComment();
    const res = await request(app)
      .patch(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', body: 'a'.repeat(5001) });

    expect(res.status).toBe(400);
  });
});

// ── REACTIONS ──

describe('Reactions', () => {
  it('adds a reaction to a comment', async () => {
    const c = await createComment();
    const res = await request(app)
      .post(`/api/comments/${c.body.data.id}/reactions`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', emoji: '👍' });

    expect(res.status).toBe(201);
    expect(res.body.data.emoji).toBe('👍');
  });

  it('handles duplicate reaction gracefully', async () => {
    const c = await createComment();
    await request(app)
      .post(`/api/comments/${c.body.data.id}/reactions`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', emoji: '👍' });

    const res = await request(app)
      .post(`/api/comments/${c.body.data.id}/reactions`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', emoji: '👍' });

    expect(res.status).toBe(200);
    expect(res.body.data.already_exists).toBe(true);
  });

  it('lists reactions grouped by emoji', async () => {
    const c = await createComment();
    await request(app).post(`/api/comments/${c.body.data.id}/reactions`).set('X-API-Key', apiKey)
      .send({ author_id: 'user1@example.com', emoji: '👍' });
    await request(app).post(`/api/comments/${c.body.data.id}/reactions`).set('X-API-Key', apiKey)
      .send({ author_id: 'user2@example.com', emoji: '👍' });
    await request(app).post(`/api/comments/${c.body.data.id}/reactions`).set('X-API-Key', apiKey)
      .send({ author_id: 'user1@example.com', emoji: '❤️' });

    const res = await request(app)
      .get(`/api/comments/${c.body.data.id}/reactions`)
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const thumbs = res.body.data.find(r => r.emoji === '👍');
    expect(thumbs.count).toBe(2);
    expect(thumbs.authors).toContain('user1@example.com');
  });

  it('removes a reaction', async () => {
    const c = await createComment();
    await request(app).post(`/api/comments/${c.body.data.id}/reactions`).set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', emoji: '👍' });

    const res = await request(app)
      .delete(`/api/comments/${c.body.data.id}/reactions`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', emoji: '👍' });

    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });

  it('returns 404 when removing non-existent reaction', async () => {
    const c = await createComment();
    const res = await request(app)
      .delete(`/api/comments/${c.body.data.id}/reactions`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', emoji: '👎' });

    expect(res.status).toBe(404);
  });

  it('rejects reaction on non-existent comment', async () => {
    const res = await request(app)
      .post('/api/comments/00000000-0000-0000-0000-000000000000/reactions')
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com', emoji: '👍' });

    expect(res.status).toBe(404);
  });

  it('rejects missing fields', async () => {
    const c = await createComment();
    const res = await request(app)
      .post(`/api/comments/${c.body.data.id}/reactions`)
      .set('X-API-Key', apiKey)
      .send({ author_id: 'user@example.com' });

    expect(res.status).toBe(400);
  });
});

// ── WEBHOOKS ──

describe('Webhooks', () => {
  it('creates a webhook', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .set('X-API-Key', apiKey)
      .send({ url: 'https://example.com/hook', events: ['comment.created'] });

    expect(res.status).toBe(201);
    expect(res.body.data.url).toBe('https://example.com/hook');
    expect(res.body.data.events).toContain('comment.created');
  });

  it('lists webhooks for a tenant', async () => {
    await request(app).post('/api/webhooks').set('X-API-Key', apiKey)
      .send({ url: 'https://example.com/hook1' });
    await request(app).post('/api/webhooks').set('X-API-Key', apiKey)
      .send({ url: 'https://example.com/hook2' });

    const res = await request(app)
      .get('/api/webhooks')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('deletes a webhook', async () => {
    const hook = await request(app).post('/api/webhooks').set('X-API-Key', apiKey)
      .send({ url: 'https://example.com/hook' });

    const res = await request(app)
      .delete(`/api/webhooks/${hook.body.data.id}`)
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  it('returns 404 for non-existent webhook', async () => {
    const res = await request(app)
      .delete('/api/webhooks/00000000-0000-0000-0000-000000000000')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(404);
  });

  it('rejects missing url', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .set('X-API-Key', apiKey)
      .send({ events: ['comment.created'] });

    expect(res.status).toBe(400);
  });
});

// ── EXPORT ──

describe('Export', () => {
  it('exports comments for a resource', async () => {
    await createComment({ body: 'Export me' });
    await createComment({ body: 'Me too' });

    const res = await request(app)
      .get('/api/export/resource?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.comments).toHaveLength(2);
    expect(res.body.data.resource_id).toBe('post-1');
  });

  it('includes deleted comments in export', async () => {
    const c = await createComment({ body: 'Will delete' });
    await request(app).delete(`/api/comments/${c.body.data.id}`).set('X-API-Key', apiKey);

    const res = await request(app)
      .get('/api/export/resource?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.body.data.count).toBe(1);
    expect(res.body.data.comments[0].deleted_at).toBeDefined();
  });

  it('exports all comments for a tenant (admin)', async () => {
    await createComment({ resource_id: 'post-1' });
    await createComment({ resource_id: 'post-2' });

    const res = await request(app)
      .get(`/api/export/tenant/${tenantId}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.tenant_id).toBe(tenantId);
  });

  it('tenant export requires admin auth', async () => {
    const res = await request(app)
      .get(`/api/export/tenant/${tenantId}`)
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(401);
  });

  it('requires resource_id for resource export', async () => {
    const res = await request(app)
      .get('/api/export/resource')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(400);
  });
});

// ── HEALTH CHECK ──

describe('Health check', () => {
  it('returns db connected status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('connected');
  });
});
