# Commently

Self-hosted comments-as-a-service API. Multi-tenant, resource-agnostic, threaded comments with webhooks, reactions, and editing.

## Tech Stack

- Node.js + Express (no TypeScript)
- PostgreSQL via `pg` (raw SQL, no ORM)
- Jest + Supertest for testing
- Static HTML/CSS/JS docs site (no build step)

## Project Structure

```
src/
  app.js              # Express app setup, CORS, routes
  server.js           # HTTP server with graceful shutdown
  db/
    pool.js            # pg connection pool
    migrate.js         # Migration runner
    migrations/        # SQL migration files (001-006)
    tenants.js         # Tenant queries (CRUD, list, stats)
    comments.js        # Comment queries (CRUD, counts, edit, export)
    webhooks.js        # Webhook queries + firing logic
    reactions.js       # Reaction queries (add, remove, list)
  middleware/
    auth.js            # adminAuth + tenantAuth
    errors.js          # AppError class + error handler
    validate.js        # Request validation middleware
    rate-limit.js      # In-memory rate limiter
    logger.js          # Structured request logging
  routes/
    tenants.js         # /api/tenants (admin endpoints)
    comments.js        # /api/comments (tenant endpoints)
    webhooks.js        # /api/webhooks (tenant endpoints)
    reactions.js       # /api/comments/:id/reactions
    export.js          # /api/export (resource + tenant-wide)
site/
  index.html           # Landing page
  docs.html            # API documentation
  admin.html           # Admin panel (session-only auth)
  styles.css           # Shared styles
tests/
  unit/                # Validation, errors, rate limiter, helpers
  integration/         # Full endpoint tests with real DB
```

## Commands

- `npm run dev` — Start dev server with --watch
- `npm start` — Production start
- `npm run db:migrate` — Run SQL migrations
- `npm test` — Run all tests (needs `commently_test` DB)
- `npm run test:unit` — Unit tests only
- `npm run test:integration` — Integration tests only

## Testing

Tests require a local PostgreSQL database named `commently_test`:
```
createdb commently_test
TEST_DATABASE_URL=postgresql://localhost:5432/commently_test npm test
```

Rate limiting and request logging are disabled when `NODE_ENV=test` (set automatically by jest.config.js).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_API_KEY` | Yes | Master key for tenant management |
| `PORT` | No | Server port (default: 3002) |
| `NODE_ENV` | No | `production`, `development`, or `test` |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `*`) |
| `COMMENT_EDIT_WINDOW_MINUTES` | No | Edit window in minutes (default: 15) |

## Deployment

Hosted on Render.com:
- **commently-api** (web service, Starter plan)
- **commently-db** (PostgreSQL, Basic 256MB)
- **commently-docs** (static site from `site/` directory)

Auto-deploy is enabled on all services — pushing to `main` triggers deploys.

## API Endpoints

### Admin (Authorization: Bearer)
- `POST /api/tenants` — Create tenant
- `GET /api/tenants` — List tenants
- `GET /api/tenants/:id/stats` — Tenant stats
- `POST /api/tenants/:id/rotate-key` — Rotate API key
- `DELETE /api/tenants/:id` — Delete tenant + all data
- `GET /api/export/tenant/:id` — Export all tenant comments

### Tenant (X-API-Key)
- `POST /api/comments` — Create comment
- `GET /api/comments` — List comments (cursor pagination)
- `GET /api/comments/counts` — Comment counts (grouped/batch)
- `PATCH /api/comments/:id` — Edit comment (time-windowed)
- `DELETE /api/comments/:id` — Soft-delete comment
- `POST /api/comments/:id/reactions` — Add reaction
- `GET /api/comments/:id/reactions` — List reactions
- `DELETE /api/comments/:id/reactions` — Remove reaction
- `POST /api/webhooks` — Register webhook
- `GET /api/webhooks` — List webhooks
- `DELETE /api/webhooks/:id` — Delete webhook
- `GET /api/export/resource` — Export resource comments

## Conventions

- All responses use `{ success: true, data: ... }` / `{ success: false, error: { code, message } }` envelope
- Soft deletes on comments (deleted_at timestamp), hard deletes on tenants
- API keys: `sk_commently_<base64url>`, stored as SHA-256 hash
- One level of threading only (replies can't have replies)
- Webhook payloads are HMAC-signed with `X-Commently-Signature` when a secret is configured
