const pool = require('./pool');

async function add(tenantId, commentId, authorId, emoji) {
  const { rows } = await pool.query(
    `INSERT INTO reactions (tenant_id, comment_id, author_id, emoji)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (comment_id, author_id, emoji) DO NOTHING
     RETURNING id, comment_id, author_id, emoji, created_at`,
    [tenantId, commentId, authorId, emoji]
  );
  return rows[0] || null;
}

async function remove(tenantId, commentId, authorId, emoji) {
  const { rowCount } = await pool.query(
    `DELETE FROM reactions
     WHERE tenant_id = $1 AND comment_id = $2 AND author_id = $3 AND emoji = $4`,
    [tenantId, commentId, authorId, emoji]
  );
  return rowCount > 0;
}

async function listByComment(commentId) {
  const { rows } = await pool.query(
    `SELECT emoji, COUNT(*)::int as count, array_agg(author_id) as authors
     FROM reactions
     WHERE comment_id = $1
     GROUP BY emoji
     ORDER BY count DESC`,
    [commentId]
  );
  return rows;
}

module.exports = { add, remove, listByComment };
