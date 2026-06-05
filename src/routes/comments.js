const { Router } = require('express');
const { tenantAuth } = require('../middleware/auth');
const { validateCreateComment, validateListComments, validateCounts } = require('../middleware/validate');
const { AppError } = require('../middleware/errors');
const comments = require('../db/comments');

const router = Router();

router.use(tenantAuth);

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

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await comments.softDelete(req.tenant.id, req.params.id);
    if (!result) {
      return next(new AppError('NOT_FOUND', 'Comment not found', 404));
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
