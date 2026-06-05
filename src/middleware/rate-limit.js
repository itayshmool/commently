const { AppError } = require('./errors');

class RateLimiter {
  constructor({ windowMs = 60000, max = 100 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), windowMs);
    this.cleanupInterval.unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now - entry.start > this.windowMs) this.hits.delete(key);
    }
  }

  check(key) {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now - entry.start > this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      return { allowed: true, remaining: this.max - 1 };
    }

    entry.count++;
    if (entry.count > this.max) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: this.max - entry.count };
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

const tenantLimiter = new RateLimiter({ windowMs: 60000, max: 200 });
const adminLimiter = new RateLimiter({ windowMs: 60000, max: 30 });

function rateLimitByKey(limiter, keyFn) {
  return (req, _res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const key = keyFn(req);
    const { allowed, remaining } = limiter.check(key);

    if (!allowed) {
      return next(new AppError('RATE_LIMITED', 'Too many requests, please try again later', 429));
    }

    next();
  };
}

const tenantRateLimit = rateLimitByKey(tenantLimiter, req => req.headers['x-api-key'] || req.ip);
const adminRateLimit = rateLimitByKey(adminLimiter, req => req.ip);

module.exports = { RateLimiter, tenantRateLimit, adminRateLimit, tenantLimiter, adminLimiter };
