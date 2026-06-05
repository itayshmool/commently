const { AppError } = require('./errors');

function validateCreateComment(req, _res, next) {
  const { resource_id, author_id, author_name, body, context_key, parent_id } = req.body;

  if (!resource_id || typeof resource_id !== 'string') {
    return next(new AppError('VALIDATION_ERROR', 'resource_id is required'));
  }
  if (resource_id.length > 500) {
    return next(new AppError('VALIDATION_ERROR', 'resource_id must be at most 500 characters'));
  }
  if (!author_id || typeof author_id !== 'string') {
    return next(new AppError('VALIDATION_ERROR', 'author_id is required'));
  }
  if (author_id.length > 500) {
    return next(new AppError('VALIDATION_ERROR', 'author_id must be at most 500 characters'));
  }
  if (!author_name || typeof author_name !== 'string') {
    return next(new AppError('VALIDATION_ERROR', 'author_name is required'));
  }
  if (!body || typeof body !== 'string') {
    return next(new AppError('VALIDATION_ERROR', 'body is required'));
  }
  if (body.length < 1 || body.length > 5000) {
    return next(new AppError('VALIDATION_ERROR', 'body must be 1-5000 characters'));
  }
  if (context_key !== undefined && context_key !== null) {
    if (typeof context_key !== 'string' || context_key.length > 200) {
      return next(new AppError('VALIDATION_ERROR', 'context_key must be a string of at most 200 characters'));
    }
  }
  if (parent_id !== undefined && parent_id !== null) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(parent_id)) {
      return next(new AppError('VALIDATION_ERROR', 'parent_id must be a valid UUID'));
    }
  }

  next();
}

function validateListComments(req, _res, next) {
  if (!req.query.resource_id) {
    return next(new AppError('VALIDATION_ERROR', 'resource_id query parameter is required'));
  }

  if (req.query.limit) {
    const limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return next(new AppError('VALIDATION_ERROR', 'limit must be between 1 and 100'));
    }
  }

  next();
}

function validateCounts(req, _res, next) {
  if (!req.query.resource_id && !req.query.resource_ids) {
    return next(new AppError('VALIDATION_ERROR', 'resource_id or resource_ids query parameter is required'));
  }

  next();
}

function validateCreateTenant(req, _res, next) {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return next(new AppError('VALIDATION_ERROR', 'name is required'));
  }
  next();
}

module.exports = { validateCreateComment, validateListComments, validateCounts, validateCreateTenant };
