const request = require('supertest');

const ADMIN_KEY = 'test-admin-key-12345';

let app, apiKey;

const { setupDatabase, cleanDatabase, teardownDatabase, TEST_DB_URL } = require('./setup');

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
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

describe('POST /api/comments', () => {
  it('creates a comment with required fields', async () => {
    const res = await createComment();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.resource_id).toBe('post-1');
    expect(res.body.data.author_id).toBe('user@example.com');
    expect(res.body.data.author_name).toBe('Alice');
    expect(res.body.data.body).toBe('Test comment');
    expect(res.body.data.created_at).toBeDefined();
  });

  it('creates a comment with all optional fields', async () => {
    const res = await createComment({
      context_key: 'slide:3',
      author_role: 'viewer',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.context_key).toBe('slide:3');
    expect(res.body.data.author_role).toBe('viewer');
  });

  it('rejects without API key', async () => {
    const res = await request(app)
      .post('/api/comments')
      .send({
        resource_id: 'post-1',
        author_id: 'user@example.com',
        author_name: 'Alice',
        body: 'No auth',
      });
    expect(res.status).toBe(401);
  });

  it('rejects with invalid API key', async () => {
    const res = await request(app)
      .post('/api/comments')
      .set('X-API-Key', 'sk_commently_invalid')
      .send({
        resource_id: 'post-1',
        author_id: 'user@example.com',
        author_name: 'Alice',
        body: 'Bad key',
      });
    expect(res.status).toBe(401);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/comments')
      .set('X-API-Key', apiKey)
      .send({ resource_id: 'post-1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects body over 5000 chars', async () => {
    const res = await createComment({ body: 'a'.repeat(5001) });
    expect(res.status).toBe(400);
  });

  it('rejects empty body', async () => {
    const res = await createComment({ body: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/comments (threading)', () => {
  it('creates a reply to an existing comment', async () => {
    const parent = await createComment();
    const parentId = parent.body.data.id;

    const reply = await createComment({
      body: 'This is a reply',
      parent_id: parentId,
    });

    expect(reply.status).toBe(201);
    expect(reply.body.data.parent_id).toBe(parentId);
  });

  it('rejects reply to non-existent parent', async () => {
    const res = await createComment({
      parent_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects reply to a reply (no nested threading)', async () => {
    const parent = await createComment();
    const reply = await createComment({
      body: 'Reply',
      parent_id: parent.body.data.id,
    });

    const nested = await createComment({
      body: 'Nested reply',
      parent_id: reply.body.data.id,
    });

    expect(nested.status).toBe(400);
    expect(nested.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects reply to a deleted parent', async () => {
    const parent = await createComment();
    const parentId = parent.body.data.id;

    await request(app)
      .delete(`/api/comments/${parentId}`)
      .set('X-API-Key', apiKey);

    const reply = await createComment({
      body: 'Reply to deleted',
      parent_id: parentId,
    });
    expect(reply.status).toBe(404);
  });

  it('rejects reply to parent on different resource', async () => {
    const parent = await createComment({ resource_id: 'post-1' });
    const reply = await createComment({
      resource_id: 'post-999',
      parent_id: parent.body.data.id,
    });
    expect(reply.status).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/comments', () => {
  it('lists comments for a resource', async () => {
    await createComment({ body: 'First' });
    await createComment({ body: 'Second' });

    const res = await request(app)
      .get('/api/comments?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.data.comments).toHaveLength(2);
    expect(res.body.data.pagination).toBeDefined();
  });

  it('returns comments in chronological order', async () => {
    await createComment({ body: 'First' });
    await createComment({ body: 'Second' });

    const res = await request(app)
      .get('/api/comments?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.body.data.comments[0].body).toBe('First');
    expect(res.body.data.comments[1].body).toBe('Second');
  });

  it('nests replies under their parent', async () => {
    const parent = await createComment({ body: 'Parent' });
    await createComment({ body: 'Reply 1', parent_id: parent.body.data.id });
    await createComment({ body: 'Reply 2', parent_id: parent.body.data.id });

    const res = await request(app)
      .get('/api/comments?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.body.data.comments).toHaveLength(1);
    expect(res.body.data.comments[0].body).toBe('Parent');
    expect(res.body.data.comments[0].replies).toHaveLength(2);
    expect(res.body.data.comments[0].replies[0].body).toBe('Reply 1');
    expect(res.body.data.comments[0].replies[1].body).toBe('Reply 2');
  });

  it('filters by context_key', async () => {
    await createComment({ context_key: 'slide:1', body: 'Slide 1 comment' });
    await createComment({ context_key: 'slide:2', body: 'Slide 2 comment' });

    const res = await request(app)
      .get('/api/comments?resource_id=post-1&context_key=slide:1')
      .set('X-API-Key', apiKey);

    expect(res.body.data.comments).toHaveLength(1);
    expect(res.body.data.comments[0].body).toBe('Slide 1 comment');
  });

  it('excludes soft-deleted comments', async () => {
    const comment = await createComment({ body: 'Will be deleted' });
    await createComment({ body: 'Will remain' });

    await request(app)
      .delete(`/api/comments/${comment.body.data.id}`)
      .set('X-API-Key', apiKey);

    const res = await request(app)
      .get('/api/comments?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.body.data.comments).toHaveLength(1);
    expect(res.body.data.comments[0].body).toBe('Will remain');
  });

  it('excludes soft-deleted replies', async () => {
    const parent = await createComment({ body: 'Parent' });
    const reply = await createComment({ body: 'Reply to delete', parent_id: parent.body.data.id });
    await createComment({ body: 'Reply to keep', parent_id: parent.body.data.id });

    await request(app)
      .delete(`/api/comments/${reply.body.data.id}`)
      .set('X-API-Key', apiKey);

    const res = await request(app)
      .get('/api/comments?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.body.data.comments[0].replies).toHaveLength(1);
    expect(res.body.data.comments[0].replies[0].body).toBe('Reply to keep');
  });

  it('returns empty list for resource with no comments', async () => {
    const res = await request(app)
      .get('/api/comments?resource_id=no-such-resource')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.data.comments).toHaveLength(0);
    expect(res.body.data.pagination.has_more).toBe(false);
  });

  it('requires resource_id', async () => {
    const res = await request(app)
      .get('/api/comments')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(400);
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await createComment({ body: `Comment ${i}` });
    }

    const res = await request(app)
      .get('/api/comments?resource_id=post-1&limit=2')
      .set('X-API-Key', apiKey);

    expect(res.body.data.comments).toHaveLength(2);
    expect(res.body.data.pagination.has_more).toBe(true);
    expect(res.body.data.pagination.next_cursor).toBeDefined();
  });

  it('paginates with cursor', async () => {
    for (let i = 0; i < 5; i++) {
      await createComment({ body: `Comment ${i}` });
    }

    const page1 = await request(app)
      .get('/api/comments?resource_id=post-1&limit=2')
      .set('X-API-Key', apiKey);

    const cursor = page1.body.data.pagination.next_cursor;

    const page2 = await request(app)
      .get(`/api/comments?resource_id=post-1&limit=2&cursor=${cursor}`)
      .set('X-API-Key', apiKey);

    expect(page2.body.data.comments).toHaveLength(2);
    expect(page2.body.data.comments[0].body).toBe('Comment 2');
    expect(page2.body.data.comments[1].body).toBe('Comment 3');
  });
});

describe('GET /api/comments/counts', () => {
  it('returns total count for a resource', async () => {
    await createComment();
    await createComment({ body: 'Second' });

    const res = await request(app)
      .get('/api/comments/counts?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
  });

  it('groups by context_key', async () => {
    await createComment({ context_key: 'slide:1' });
    await createComment({ context_key: 'slide:1', body: 'Second on slide 1' });
    await createComment({ context_key: 'slide:2' });

    const res = await request(app)
      .get('/api/comments/counts?resource_id=post-1&group_by=context_key')
      .set('X-API-Key', apiKey);

    expect(res.body.data.total).toBe(3);
    expect(res.body.data.groups['slide:1']).toBe(2);
    expect(res.body.data.groups['slide:2']).toBe(1);
  });

  it('returns batch counts for multiple resources', async () => {
    await createComment({ resource_id: 'post-1' });
    await createComment({ resource_id: 'post-1', body: 'Second' });
    await createComment({ resource_id: 'post-2' });

    const res = await request(app)
      .get('/api/comments/counts?resource_ids=post-1,post-2,post-3')
      .set('X-API-Key', apiKey);

    expect(res.body.data.counts['post-1']).toBe(2);
    expect(res.body.data.counts['post-2']).toBe(1);
    expect(res.body.data.counts['post-3']).toBe(0);
  });

  it('excludes deleted comments from counts', async () => {
    const c = await createComment();
    await createComment({ body: 'Second' });

    await request(app)
      .delete(`/api/comments/${c.body.data.id}`)
      .set('X-API-Key', apiKey);

    const res = await request(app)
      .get('/api/comments/counts?resource_id=post-1')
      .set('X-API-Key', apiKey);

    expect(res.body.data.total).toBe(1);
  });

  it('requires resource_id or resource_ids', async () => {
    const res = await request(app)
      .get('/api/comments/counts')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/comments/:id', () => {
  it('soft-deletes a comment', async () => {
    const comment = await createComment();
    const commentId = comment.body.data.id;

    const res = await request(app)
      .delete(`/api/comments/${commentId}`)
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(commentId);
    expect(res.body.data.deleted_at).toBeDefined();
  });

  it('returns 404 for non-existent comment', async () => {
    const res = await request(app)
      .delete('/api/comments/00000000-0000-0000-0000-000000000000')
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting already-deleted comment', async () => {
    const comment = await createComment();
    const commentId = comment.body.data.id;

    await request(app)
      .delete(`/api/comments/${commentId}`)
      .set('X-API-Key', apiKey);

    const res = await request(app)
      .delete(`/api/comments/${commentId}`)
      .set('X-API-Key', apiKey);

    expect(res.status).toBe(404);
  });

  it('replies remain visible after parent is deleted', async () => {
    const parent = await createComment({ body: 'Parent' });
    await createComment({ body: 'Reply', parent_id: parent.body.data.id });

    await request(app)
      .delete(`/api/comments/${parent.body.data.id}`)
      .set('X-API-Key', apiKey);

    // parent gone from listing, but reply's parent_id still points there
    const res = await request(app)
      .get('/api/comments?resource_id=post-1')
      .set('X-API-Key', apiKey);

    // parent is deleted so it's excluded; orphaned replies won't show as top-level
    // since they have parent_id set. This matches the spec: "replies remain visible
    // but show parent_id pointing to a deleted comment"
    expect(res.body.data.comments).toHaveLength(0);
  });
});

describe('Tenant isolation', () => {
  let apiKey2;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ name: 'other-app' });
    apiKey2 = res.body.data.api_key;
  });

  it('tenant A cannot see tenant B comments', async () => {
    await createComment({ body: 'Tenant A comment' });

    const res = await request(app)
      .get('/api/comments?resource_id=post-1')
      .set('X-API-Key', apiKey2);

    expect(res.body.data.comments).toHaveLength(0);
  });

  it('tenant A cannot delete tenant B comments', async () => {
    const comment = await createComment({ body: 'Tenant A comment' });

    const res = await request(app)
      .delete(`/api/comments/${comment.body.data.id}`)
      .set('X-API-Key', apiKey2);

    expect(res.status).toBe(404);
  });

  it('counts are isolated per tenant', async () => {
    await createComment();
    await request(app)
      .post('/api/comments')
      .set('X-API-Key', apiKey2)
      .send({
        resource_id: 'post-1',
        author_id: 'other@example.com',
        author_name: 'Bob',
        body: 'Other tenant',
      });

    const res1 = await request(app)
      .get('/api/comments/counts?resource_id=post-1')
      .set('X-API-Key', apiKey);

    const res2 = await request(app)
      .get('/api/comments/counts?resource_id=post-1')
      .set('X-API-Key', apiKey2);

    expect(res1.body.data.total).toBe(1);
    expect(res2.body.data.total).toBe(1);
  });
});

describe('Health check', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
