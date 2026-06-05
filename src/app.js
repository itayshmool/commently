const express = require('express');
const { errorHandler } = require('./middleware/errors');
const { requestLogger } = require('./middleware/logger');
const tenantsRouter = require('./routes/tenants');
const commentsRouter = require('./routes/comments');
const webhooksRouter = require('./routes/webhooks');
const reactionsRouter = require('./routes/reactions');
const exportRouter = require('./routes/export');
const pool = require('./db/pool');

const app = express();

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : null;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS) {
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Author-Id');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(requestLogger);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use('/api/tenants', tenantsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/comments', reactionsRouter);
app.use('/api/export', exportRouter);

app.use(errorHandler);

module.exports = app;
