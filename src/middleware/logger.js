function requestLogger(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      tenant: req.tenant?.name || null,
      ip: req.ip,
    };

    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(log));
    } else {
      const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(
        `${statusColor}${res.statusCode}\x1b[0m ${req.method} ${req.originalUrl} ${duration}ms${req.tenant ? ` [${req.tenant.name}]` : ''}`
      );
    }
  });

  next();
}

module.exports = { requestLogger };
