# Commently

Self-hosted comments-as-a-service. Add threaded, context-anchored comments to any application.

## What it does

Commently is a generic comments API. It doesn't know what your app is — it stores comments against opaque resource IDs that you define. One service, many apps.

```
Your App (DeckDrop, blog, docs)  →  Commently API  →  PostgreSQL
         X-API-Key + payload
```

**Key properties:**
- **Multi-tenant** — each app gets its own API key, data is fully isolated
- **Resource-agnostic** — comments attach to any `resource_id` string
- **Context-anchored** — optional `context_key` for sub-locations (slide, paragraph, section)
- **Threaded** — one level of replies via `parent_id`
- **Reactions** — emoji reactions on comments with grouped counts
- **Webhooks** — get notified on comment.created and comment.deleted
- **Editable** — comments can be edited within a configurable time window
- **Stateless** — no sessions, no WebSocket, scales horizontally

## Quick Start

```bash
# Prerequisites: Node.js 20+, PostgreSQL 16+

git clone https://github.com/itayshmool/commently.git
cd commently
npm install

# Create database
createdb commently

# Configure
cp .env.example .env
# Edit .env with your DATABASE_URL and ADMIN_API_KEY

# Run migrations
npm run db:migrate

# Start
npm run dev
# → http://localhost:3002
```

## Usage

### 1. Register your app as a tenant

```bash
curl -X POST http://localhost:3002/api/tenants \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}'

# Response includes api_key — save it, shown only once.
```

### 2. Post a comment

```bash
curl -X POST http://localhost:3002/api/comments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource_id": "post-123",
    "context_key": "paragraph:5",
    "author_id": "user@example.com",
    "author_name": "Alice",
    "body": "Great point here!"
  }'
```

### 3. Fetch comments

```bash
# All comments on a resource
curl "http://localhost:3002/api/comments?resource_id=post-123" \
  -H "X-API-Key: $API_KEY"

# Filtered by context
curl "http://localhost:3002/api/comments?resource_id=post-123&context_key=paragraph:5" \
  -H "X-API-Key: $API_KEY"

# Counts per context (for badges)
curl "http://localhost:3002/api/comments/counts?resource_id=post-123&group_by=context_key" \
  -H "X-API-Key: $API_KEY"
```

### 4. Reply, react, edit

```bash
# Reply to a comment
curl -X POST http://localhost:3002/api/comments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"resource_id":"post-123","author_id":"bob@example.com","author_name":"Bob","body":"Agreed!","parent_id":"COMMENT_UUID"}'

# Add a reaction
curl -X POST http://localhost:3002/api/comments/COMMENT_UUID/reactions \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"author_id":"bob@example.com","emoji":"👍"}'

# Edit a comment (within 15 min window)
curl -X PATCH http://localhost:3002/api/comments/COMMENT_UUID \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"author_id":"user@example.com","body":"Updated text"}'
```

### 5. Set up webhooks

```bash
curl -X POST http://localhost:3002/api/webhooks \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://myapp.com/webhook","events":["comment.created"],"secret":"signing-key"}'
```

## API Reference

### Admin endpoints (Authorization: Bearer)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tenants` | Register a new tenant |
| `GET` | `/api/tenants` | List all tenants |
| `GET` | `/api/tenants/:id/stats` | Get tenant stats and recent activity |
| `POST` | `/api/tenants/:id/rotate-key` | Rotate tenant API key |
| `DELETE` | `/api/tenants/:id` | Delete tenant and all its data |
| `GET` | `/api/export/tenant/:id` | Export all tenant comments |

### Tenant endpoints (X-API-Key)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/comments` | Create a comment |
| `GET` | `/api/comments` | List comments for a resource |
| `GET` | `/api/comments/counts` | Get comment counts (with optional grouping) |
| `PATCH` | `/api/comments/:id` | Edit a comment (time-windowed, author-only) |
| `DELETE` | `/api/comments/:id` | Soft-delete a comment |
| `POST` | `/api/comments/:id/reactions` | Add an emoji reaction |
| `GET` | `/api/comments/:id/reactions` | List reactions (grouped by emoji) |
| `DELETE` | `/api/comments/:id/reactions` | Remove a reaction |
| `POST` | `/api/webhooks` | Register a webhook |
| `GET` | `/api/webhooks` | List webhooks |
| `DELETE` | `/api/webhooks/:id` | Delete a webhook |
| `GET` | `/api/export/resource` | Export comments for a resource |

See the [full documentation](https://commently-docs.onrender.com/docs.html) for request/response schemas, validation rules, and error codes.

## Tech Stack

- Node.js + Express
- PostgreSQL (via `pg`)
- No ORM — raw SQL with parameterized queries
- Jest + Supertest (130 tests)

## Auth Model

- **Tenant auth**: API key in `X-API-Key` header (server-to-server)
- **User auth**: none — your app authenticates its own users and passes `author_id`/`author_name`
- **Admin auth**: master key in `Authorization: Bearer` header (tenant management only)

Commently trusts your app to verify users. It only verifies that your app is who it says it is.

## Production Features

- **Rate limiting** — 200 req/min per tenant, 30 req/min for admin
- **Request logging** — structured JSON in production
- **DB health check** — `/health` verifies database connectivity
- **CORS** — configurable via `CORS_ORIGINS` env var
- **Graceful shutdown** — drains connections on SIGTERM/SIGINT
- **Audit logging** — `X-Author-Id` header on deletions

## Configuration

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_API_KEY` | Yes | Master key for tenant management |
| `PORT` | No | Server port (default: 3002) |
| `NODE_ENV` | No | `production` or `development` |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `*`) |
| `COMMENT_EDIT_WINDOW_MINUTES` | No | Edit window in minutes (default: 15) |

## Deployment

Designed for Render.com but runs anywhere Node.js does.

| Service | Type | URL |
|---|---|---|
| commently-api | Web Service (Starter) | [commently-api.onrender.com](https://commently-api.onrender.com) |
| commently-db | PostgreSQL (Basic 256MB) | Internal |
| commently-docs | Static Site | [commently-docs.onrender.com](https://commently-docs.onrender.com) |

**Total cost: ~$14/mo**

## Links

- [Live Docs](https://commently-docs.onrender.com)
- [Admin Panel](https://commently-docs.onrender.com/admin.html)
- [API Health](https://commently-api.onrender.com/health)

## License

MIT
