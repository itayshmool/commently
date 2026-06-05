const crypto = require('crypto');
const pool = require('./pool');

function generateApiKey() {
  return 'sk_commently_' + crypto.randomBytes(24).toString('base64url');
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function create(name) {
  const apiKey = generateApiKey();
  const hash = hashApiKey(apiKey);
  const prefix = apiKey.slice(0, 20);

  const { rows } = await pool.query(
    `INSERT INTO tenants (name, api_key_hash, api_key_prefix)
     VALUES ($1, $2, $3)
     RETURNING id, name, created_at`,
    [name, hash, prefix]
  );

  return { ...rows[0], api_key: apiKey };
}

async function findByApiKey(apiKey) {
  const hash = hashApiKey(apiKey);
  const { rows } = await pool.query(
    'SELECT id, name, created_at FROM tenants WHERE api_key_hash = $1',
    [hash]
  );
  return rows[0] || null;
}

async function rotateKey(id) {
  const apiKey = generateApiKey();
  const hash = hashApiKey(apiKey);
  const prefix = apiKey.slice(0, 20);

  const { rowCount } = await pool.query(
    `UPDATE tenants SET api_key_hash = $1, api_key_prefix = $2 WHERE id = $3`,
    [hash, prefix, id]
  );

  if (rowCount === 0) return null;
  return { api_key: apiKey };
}

module.exports = { create, findByApiKey, rotateKey, generateApiKey, hashApiKey };
