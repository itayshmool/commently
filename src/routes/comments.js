const { Router } = require('express');
const { tenantAuth } = require('../middleware/auth');
const { tenantRateLimit } = require('../middleware/rate-limit');
const { validateCreateComment, validateListComments, validateCounts } = require('../middleware/validate');
const { AppError } = require('../middleware/errors');
const comments = require('../db/comments');
const webhooks = require('../db/webhooks');

const router = Router();

router.use(tenantAuth);
router.use(tenantRateLimit);

router.post('/', validateCreateComment, async (req, res, next) => {
  try {
    if (req.body.parent_id) {
      const parent = await comments.findById(req.tenant.id, req.body.parent_id);
      if (!parent || parent.deleted_at) {
        return next(new AppError('NOT_FOUND', 'Parent comment not found', 404));
      }
      if (parent.resource_id !== req.body.resource_id) {
        return next(new AppError('VALIDATION_ERROR', 'Parent comment must be on the same resource'));
      }
      if (parent.parent_id) {
        return next(new AppError('VALIDATION_ERROR', 'Cannot reply to a reply (max one level of threading)'));
      }
    }

    const comment = await comments.create(req.tenant.id, req.body);
    res.status(201).json({ success: true, data: comment });
    webhooks.fire(req.tenant.id, 'comment.created', comment).catch(() => {});
  } catch (err) {
    next(err);
  }
});

router.get('/', validateListComments, async (req, res, next) => {
  try {
    const { resource_id, context_key, cursor, limit } = req.query;
    const result = await comments.list(req.tenant.id, {
      resource_id,
      context_key,
      cursor,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/counts', validateCounts, async (req, res, next) => {
  try {
    const { resource_id, resource_ids, group_by } = req.query;
    const result = await comments.counts(req.tenant.id, { resource_id, resource_ids, group_by });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { author_id, body } = req.body;
    if (!author_id || typeof author_id !== 'string') {
      return next(new AppError('VALIDATION_ERROR', 'author_id is required'));
    }
    if (!body || typeof body !== 'string' || body.length < 1 || body.length > 5000) {
      return next(new AppError('VALIDATION_ERROR', 'body must be 1-5000 characters'));
    }

    const result = await comments.edit(req.tenant.id, req.params.id, author_id, body);
    if (result.error === 'NOT_FOUND') {
      return next(new AppError('NOT_FOUND', 'Comment not found', 404));
    }
    if (result.error === 'FORBIDDEN') {
      return next(new AppError('FORBIDDEN', 'Only the author can edit this comment', 403));
    }
    if (result.error === 'WINDOW_EXPIRED') {
      return next(new AppError('EDIT_WINDOW_EXPIRED', 'Edit window has expired', 403));
    }

    res.json({ success: true, data: result.data });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const authorId = req.headers['x-author-id'] || null;
    const result = await comments.softDelete(req.tenant.id, req.params.id, authorId);
    if (!result) {
      return next(new AppError('NOT_FOUND', 'Comment not found', 404));
    }
    res.json({ success: true, data: result });
    webhooks.fire(req.tenant.id, 'comment.deleted', result).catch(() => {});
  } catch (err) {
    next(err);
  }
});

module.exports = router;
