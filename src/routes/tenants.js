const { Router } = require('express');
const { adminAuth } = require('../middleware/auth');
const { validateCreateTenant } = require('../middleware/validate');
const { AppError } = require('../middleware/errors');
const tenants = require('../db/tenants');

const router = Router();

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

module.exports = router;
