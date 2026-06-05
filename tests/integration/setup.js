const { Pool } = require('pg');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/commently_test';

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DB_URL });
  }
  return pool;
}

async function setupDatabase() {
  const p = getPool();

  await p.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      api_key_hash TEXT NOT NULL,
      api_key_prefix TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      resource_id TEXT NOT NULL,
      context_key TEXT,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT,
      body TEXT NOT NULL,
      parent_id UUID REFERENCES comments(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT,
      edited_at TIMESTAMPTZ
    )
  `);

  await p.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_by TEXT`);
  await p.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT '{"comment.created","comment.deleted"}',
      secret TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS reactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (comment_id, author_id, emoji)
    )
  `);
}

async function cleanDatabase() {
  const p = getPool();
  await p.query('DELETE FROM reactions');
  await p.query('DELETE FROM webhooks');
  await p.query('DELETE FROM comments');
  await p.query('DELETE FROM tenants');
}

async function teardownDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, setupDatabase, cleanDatabase, teardownDatabase, TEST_DB_URL };
