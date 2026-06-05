const { Router } = require('express');
const { adminAuth } = require('../middleware/auth');
const { adminRateLimit } = require('../middleware/rate-limit');
const { validateCreateTenant } = require('../middleware/validate');
const { AppError } = require('../middleware/errors');
const tenants = require('../db/tenants');

const router = Router();

router.use(adminRateLimit);

router.post('/', adminAuth, validateCreateTenant, async (req, res, next) => {
  try {
    const tenant = await tenants.create(req.body.name.trim());
    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    if (err.code === '23505') {
      return next(new AppError('CONFLICT', 'Tenant name already exists', 409));
    }
    next(err);
  }
});

router.get('/', adminAuth, async (_req, res, next) => {
  try {
    const list = await tenants.list();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/stats', adminAuth, async (req, res, next) => {
  try {
    const result = await tenants.stats(req.params.id);
    if (!result) {
      return next(new AppError('NOT_FOUND', 'Tenant not found', 404));
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rotate-key', adminAuth, async (req, res, next) => {
  try {
    const result = await tenants.rotateKey(req.params.id);
    if (!result) {
      return next(new AppError('NOT_FOUND', 'Tenant not found', 404));
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', adminAuth, async (req, res, next) => {
  try {
    const removed = await tenants.remove(req.params.id);
    if (!removed) {
      return next(new AppError('NOT_FOUND', 'Tenant not found', 404));
    }
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
