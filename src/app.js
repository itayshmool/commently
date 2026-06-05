const express = require('express');
const { errorHandler } = require('./middleware/errors');
const tenantsRouter = require('./routes/tenants');
const commentsRouter = require('./routes/comments');

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/tenants', tenantsRouter);
app.use('/api/comments', commentsRouter);

app.use(errorHandler);

module.exports = app;
