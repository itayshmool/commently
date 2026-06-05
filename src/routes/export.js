const { Router } = require('express');
const { tenantAuth } = require('../middleware/auth');
const { adminAuth } = require('../middleware/auth');
const { AppError } = require('../middleware/errors');
const comments = require('../db/comments');

const router = Router();

router.get('/resource', tenantAuth, async (req, res, next) => {
  try {
    const { resource_id } = req.query;
    if (!resource_id) {
      return next(new AppError('VALIDATION_ERROR', 'resource_id query parameter is required'));
    }

    const data = await comments.exportByResource(req.tenant.id, resource_id);
    res.json({ success: true, data: { resource_id, count: data.length, comments: data } });
  } catch (err) {
    next(err);
  }
});

router.get('/tenant/:id', adminAuth, async (req, res, next) => {
  try {
    const data = await comments.exportByTenant(req.params.id);
    res.json({ success: true, data: { tenant_id: req.params.id, count: data.length, comments: data } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
