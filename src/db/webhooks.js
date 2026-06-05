const crypto = require('crypto');
const pool = require('./pool');

async function create(tenantId, { url, events, secret }) {
  const { rows } = await pool.query(
    `INSERT INTO webhooks (tenant_id, url, events, secret)
     VALUES ($1, $2, $3, $4)
     RETURNING id, url, events, active, created_at`,
    [tenantId, url, events || ['comment.created', 'comment.deleted'], secret || null]
  );
  return rows[0];
}

async function list(tenantId) {
  const { rows } = await pool.query(
    'SELECT id, url, events, active, created_at FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return rows;
}

async function remove(tenantId, webhookId) {
  const { rowCount } = await pool.query(
    'DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2',
    [webhookId, tenantId]
  );
  return rowCount > 0;
}

async function findActiveByTenant(tenantId, event) {
  const { rows } = await pool.query(
    `SELECT id, url, secret FROM webhooks
     WHERE tenant_id = $1 AND active = true AND $2 = ANY(events)`,
    [tenantId, event]
  );
  return rows;
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

async function fire(tenantId, event, data) {
  const hooks = await findActiveByTenant(tenantId, event);
  const payload = { event, data, timestamp: new Date().toISOString() };

  const results = await Promise.allSettled(
    hooks.map(async (hook) => {
      const headers = { 'Content-Type': 'application/json' };
      if (hook.secret) {
        headers['X-Commently-Signature'] = signPayload(payload, hook.secret);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(hook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        return { webhook_id: hook.id, status: res.status };
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  return results;
}

module.exports = { create, list, remove, fire, signPayload };
