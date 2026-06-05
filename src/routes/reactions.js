const { Router } = require('express');
const { tenantAuth } = require('../middleware/auth');
const { tenantRateLimit } = require('../middleware/rate-limit');
const { AppError } = require('../middleware/errors');
const reactions = require('../db/reactions');
const comments = require('../db/comments');

const router = Router();

router.use(tenantAuth);
router.use(tenantRateLimit);

router.post('/:commentId/reactions', async (req, res, next) => {
  try {
    const { author_id, emoji } = req.body;
    if (!author_id || !emoji) {
      return next(new AppError('VALIDATION_ERROR', 'author_id and emoji are required'));
    }
    if (emoji.length > 32) {
      return next(new AppError('VALIDATION_ERROR', 'emoji must be at most 32 characters'));
    }

    const comment = await comments.findById(req.tenant.id, req.params.commentId);
    if (!comment || comment.deleted_at) {
      return next(new AppError('NOT_FOUND', 'Comment not found', 404));
    }

    const reaction = await reactions.add(req.tenant.id, req.params.commentId, author_id, emoji);
    if (!reaction) {
      return res.json({ success: true, data: { already_exists: true } });
    }
    res.status(201).json({ success: true, data: reaction });
  } catch (err) {
    next(err);
  }
});

router.delete('/:commentId/reactions', async (req, res, next) => {
  try {
    const { author_id, emoji } = req.body;
    if (!author_id || !emoji) {
      return next(new AppError('VALIDATION_ERROR', 'author_id and emoji are required'));
    }

    const removed = await reactions.remove(req.tenant.id, req.params.commentId, author_id, emoji);
    if (!removed) {
      return next(new AppError('NOT_FOUND', 'Reaction not found', 404));
    }
    res.json({ success: true, data: { removed: true } });
  } catch (err) {
    next(err);
  }
});

router.get('/:commentId/reactions', async (req, res, next) => {
  try {
    const list = await reactions.listByComment(req.params.commentId);
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
