const { validateCreateComment, validateListComments, validateCounts, validateCreateTenant } = require('../../src/middleware/validate');

function makeReq(body = {}, query = {}) {
  return { body, query };
}

function callMiddleware(fn, req) {
  return new Promise((resolve) => {
    fn(req, {}, (err) => resolve(err));
  });
}

describe('validateCreateComment', () => {
  const validBody = {
    resource_id: 'post-123',
    author_id: 'user@example.com',
    author_name: 'Alice',
    body: 'Hello world',
  };

  it('passes with valid required fields', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq(validBody));
    expect(err).toBeUndefined();
  });

  it('passes with all optional fields', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({
      ...validBody,
      context_key: 'slide:3',
      author_role: 'viewer',
      parent_id: '12345678-1234-1234-1234-123456789abc',
    }));
    expect(err).toBeUndefined();
  });

  it('rejects missing resource_id', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, resource_id: undefined }));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toMatch(/resource_id/);
  });

  it('rejects non-string resource_id', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, resource_id: 123 }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects resource_id over 500 chars', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, resource_id: 'a'.repeat(501) }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing author_id', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, author_id: undefined }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects author_id over 500 chars', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, author_id: 'a'.repeat(501) }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing author_name', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, author_name: undefined }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing body', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, body: undefined }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty body', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, body: '' }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects body over 5000 chars', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, body: 'a'.repeat(5001) }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects context_key over 200 chars', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, context_key: 'a'.repeat(201) }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid parent_id UUID', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, parent_id: 'not-a-uuid' }));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toMatch(/parent_id/);
  });

  it('allows null parent_id', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, parent_id: null }));
    expect(err).toBeUndefined();
  });

  it('allows null context_key', async () => {
    const err = await callMiddleware(validateCreateComment, makeReq({ ...validBody, context_key: null }));
    expect(err).toBeUndefined();
  });
});

describe('validateListComments', () => {
  it('passes with resource_id', async () => {
    const err = await callMiddleware(validateListComments, makeReq({}, { resource_id: 'post-123' }));
    expect(err).toBeUndefined();
  });

  it('rejects missing resource_id', async () => {
    const err = await callMiddleware(validateListComments, makeReq({}, {}));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects limit below 1', async () => {
    const err = await callMiddleware(validateListComments, makeReq({}, { resource_id: 'x', limit: '0' }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects limit above 100', async () => {
    const err = await callMiddleware(validateListComments, makeReq({}, { resource_id: 'x', limit: '101' }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-numeric limit', async () => {
    const err = await callMiddleware(validateListComments, makeReq({}, { resource_id: 'x', limit: 'abc' }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('passes with valid limit', async () => {
    const err = await callMiddleware(validateListComments, makeReq({}, { resource_id: 'x', limit: '50' }));
    expect(err).toBeUndefined();
  });
});

describe('validateCounts', () => {
  it('passes with resource_id', async () => {
    const err = await callMiddleware(validateCounts, makeReq({}, { resource_id: 'x' }));
    expect(err).toBeUndefined();
  });

  it('passes with resource_ids', async () => {
    const err = await callMiddleware(validateCounts, makeReq({}, { resource_ids: 'a,b,c' }));
    expect(err).toBeUndefined();
  });

  it('rejects when neither provided', async () => {
    const err = await callMiddleware(validateCounts, makeReq({}, {}));
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});

describe('validateCreateTenant', () => {
  it('passes with valid name', async () => {
    const err = await callMiddleware(validateCreateTenant, makeReq({ name: 'my-app' }));
    expect(err).toBeUndefined();
  });

  it('rejects missing name', async () => {
    const err = await callMiddleware(validateCreateTenant, makeReq({}));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty string name', async () => {
    const err = await callMiddleware(validateCreateTenant, makeReq({ name: '  ' }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-string name', async () => {
    const err = await callMiddleware(validateCreateTenant, makeReq({ name: 123 }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});
