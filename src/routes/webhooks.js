const { Router } = require('express');
const { tenantAuth } = require('../middleware/auth');
const { tenantRateLimit } = require('../middleware/rate-limit');
const { AppError } = require('../middleware/errors');
const webhooks = require('../db/webhooks');

const router = Router();

router.use(tenantAuth);
router.use(tenantRateLimit);

router.post('/', async (req, res, next) => {
  try {
    const { url, events, secret } = req.body;
    if (!url || typeof url !== 'string') {
      return next(new AppError('VALIDATION_ERROR', 'url is required'));
    }
    const webhook = await webhooks.create(req.tenant.id, { url, events, secret });
    res.status(201).json({ success: true, data: webhook });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const list = await webhooks.list(req.tenant.id);
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const removed = await webhooks.remove(req.tenant.id, req.params.id);
    if (!removed) {
      return next(new AppError('NOT_FOUND', 'Webhook not found', 404));
    }
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
