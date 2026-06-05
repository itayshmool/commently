const pool = require('./pool');

async function create(tenantId, data) {
  const { resource_id, context_key, author_id, author_name, author_role, body, parent_id } = data;

  const { rows } = await pool.query(
    `INSERT INTO comments (tenant_id, resource_id, context_key, author_id, author_name, author_role, body, parent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, resource_id, context_key, author_id, author_name, author_role, body, parent_id, created_at`,
    [tenantId, resource_id, context_key || null, author_id, author_name, author_role || null, body, parent_id || null]
  );

  return rows[0];
}

async function findById(tenantId, commentId) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, resource_id, context_key, author_id, author_name, author_role, body, parent_id, created_at, deleted_at
     FROM comments WHERE id = $1 AND tenant_id = $2`,
    [commentId, tenantId]
  );
  return rows[0] || null;
}

async function list(tenantId, { resource_id, context_key, cursor, limit = 50 }) {
  const params = [tenantId, resource_id];
  let where = 'tenant_id = $1 AND resource_id = $2 AND deleted_at IS NULL AND parent_id IS NULL';
  let paramIdx = 3;

  if (context_key) {
    where += ` AND context_key = $${paramIdx}`;
    params.push(context_key);
    paramIdx++;
  }

  if (cursor) {
    where += ` AND created_at > (SELECT created_at FROM comments WHERE id = $${paramIdx})`;
    params.push(cursor);
    paramIdx++;
  }

  params.push(Math.min(limit, 100));

  const { rows: parents } = await pool.query(
    `SELECT id, resource_id, context_key, author_id, author_name, author_role, body, parent_id, created_at
     FROM comments WHERE ${where}
     ORDER BY created_at ASC
     LIMIT $${paramIdx}`,
    params
  );

  if (parents.length === 0) {
    return { comments: [], pagination: { next_cursor: null, has_more: false } };
  }

  const parentIds = parents.map(p => p.id);
  const { rows: replies } = await pool.query(
    `SELECT id, resource_id, context_key, author_id, author_name, author_role, body, parent_id, created_at
     FROM comments
     WHERE parent_id = ANY($1) AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [parentIds]
  );

  const repliesByParent = {};
  for (const reply of replies) {
    if (!repliesByParent[reply.parent_id]) repliesByParent[reply.parent_id] = [];
    repliesByParent[reply.parent_id].push(reply);
  }

  const comments = parents.map(p => ({
    ...p,
    replies: repliesByParent[p.id] || [],
  }));

  const actualLimit = Math.min(limit, 100);
  const has_more = parents.length === actualLimit;
  const next_cursor = has_more ? parents[parents.length - 1].id : null;

  return { comments, pagination: { next_cursor, has_more } };
}

async function counts(tenantId, { resource_id, resource_ids, group_by }) {
  if (resource_ids) {
    const ids = resource_ids.split(',').slice(0, 50);
    const { rows } = await pool.query(
      `SELECT resource_id, COUNT(*)::int as count
       FROM comments
       WHERE tenant_id = $1 AND resource_id = ANY($2) AND deleted_at IS NULL
       GROUP BY resource_id`,
      [tenantId, ids]
    );
    const countsMap = {};
    for (const id of ids) countsMap[id] = 0;
    for (const row of rows) countsMap[row.resource_id] = row.count;
    return { counts: countsMap };
  }

  if (group_by === 'context_key') {
    const { rows } = await pool.query(
      `SELECT context_key, COUNT(*)::int as count
       FROM comments
       WHERE tenant_id = $1 AND resource_id = $2 AND deleted_at IS NULL
       GROUP BY context_key`,
      [tenantId, resource_id]
    );
    const groups = {};
    let total = 0;
    for (const row of rows) {
      groups[row.context_key || '__none__'] = row.count;
      total += row.count;
    }
    return { total, groups };
  }

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int as total
     FROM comments
     WHERE tenant_id = $1 AND resource_id = $2 AND deleted_at IS NULL`,
    [tenantId, resource_id]
  );
  return { total: rows[0].total };
}

async function softDelete(tenantId, commentId, deletedBy = null) {
  const { rows } = await pool.query(
    `UPDATE comments SET deleted_at = NOW(), deleted_by = $3
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, deleted_at, deleted_by`,
    [commentId, tenantId, deletedBy]
  );
  return rows[0] || null;
}

const EDIT_WINDOW_MS = parseInt(process.env.COMMENT_EDIT_WINDOW_MINUTES || '15', 10) * 60 * 1000;

async function edit(tenantId, commentId, authorId, newBody) {
  const comment = await findById(tenantId, commentId);
  if (!comment || comment.deleted_at) return { error: 'NOT_FOUND' };
  if (comment.author_id !== authorId) return { error: 'FORBIDDEN' };

  const elapsed = Date.now() - new Date(comment.created_at).getTime();
  if (elapsed > EDIT_WINDOW_MS) return { error: 'WINDOW_EXPIRED' };

  const { rows } = await pool.query(
    `UPDATE comments SET body = $1, updated_at = NOW(), edited_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id, resource_id, context_key, author_id, author_name, author_role, body, parent_id, created_at, edited_at`,
    [newBody, commentId, tenantId]
  );
  return { data: rows[0] };
}

async function exportByResource(tenantId, resourceId) {
  const { rows } = await pool.query(
    `SELECT id, resource_id, context_key, author_id, author_name, author_role, body, parent_id, created_at, edited_at, deleted_at, deleted_by
     FROM comments
     WHERE tenant_id = $1 AND resource_id = $2
     ORDER BY created_at ASC`,
    [tenantId, resourceId]
  );
  return rows;
}

async function exportByTenant(tenantId) {
  const { rows } = await pool.query(
    `SELECT id, resource_id, context_key, author_id, author_name, author_role, body, parent_id, created_at, edited_at, deleted_at, deleted_by
     FROM comments
     WHERE tenant_id = $1
     ORDER BY created_at ASC`,
    [tenantId]
  );
  return rows;
}

module.exports = { create, findById, list, counts, softDelete, edit, exportByResource, exportByTenant, EDIT_WINDOW_MS };
