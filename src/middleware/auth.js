const tenants = require('../db/tenants');
const { AppError } = require('./errors');

function adminAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Missing or invalid Authorization header', 401));
  }

  const token = header.slice(7);
  if (!process.env.ADMIN_API_KEY || token !== process.env.ADMIN_API_KEY) {
    return next(new AppError('UNAUTHORIZED', 'Invalid admin key', 401));
  }

  next();
}

async function tenantAuth(req, _res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return next(new AppError('UNAUTHORIZED', 'Missing X-API-Key header', 401));
  }

  try {
    const tenant = await tenants.findByApiKey(apiKey);
    if (!tenant) {
      return next(new AppError('UNAUTHORIZED', 'Invalid API key', 401));
    }
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { adminAuth, tenantAuth };
