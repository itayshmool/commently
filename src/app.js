const express = require('express');
const { errorHandler } = require('./middleware/errors');
const tenantsRouter = require('./routes/tenants');
const commentsRouter = require('./routes/comments');

const app = express();

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/tenants', tenantsRouter);
app.use('/api/comments', commentsRouter);

app.use(errorHandler);

module.exports = app;
