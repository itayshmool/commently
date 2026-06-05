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
- **Stateless** — no sessions, no WebSocket, scales horizontally

## Quick Start

```bash
# Prerequisites: Node.js 20+, PostgreSQL 16+

git clone https://github.com/itays/commently.git
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
# Replace $ADMIN_KEY with your admin key, $API_KEY with tenant key

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
# → { "data": { "total": 8, "groups": { "paragraph:5": 3, "paragraph:12": 5 } } }
```

### 4. Reply to a comment

```bash
curl -X POST http://localhost:3002/api/comments \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource_id": "post-123",
    "context_key": "paragraph:5",
    "author_id": "bob@example.com",
    "author_name": "Bob",
    "body": "Agreed!",
    "parent_id": "COMMENT_UUID"
  }'
```

### 5. Delete a comment

```bash
curl -X DELETE http://localhost:3002/api/comments/COMMENT_UUID \
  -H "X-API-Key: $API_KEY"
```

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tenants` | Register a new tenant (admin key required) |
| `POST` | `/api/tenants/:id/rotate-key` | Rotate tenant API key (admin key required) |
| `POST` | `/api/comments` | Create a comment |
| `GET` | `/api/comments` | List comments for a resource |
| `GET` | `/api/comments/counts` | Get comment counts (with optional grouping) |
| `DELETE` | `/api/comments/:id` | Soft-delete a comment |

See [SPEC.md](SPEC.md) for full request/response schemas, validation rules, and error codes.

## Tech Stack

- Node.js + Express
- PostgreSQL (via `pg`)
- No ORM — raw SQL with parameterized queries

## Auth Model

- **Tenant auth**: API key in `X-API-Key` header (server-to-server)
- **User auth**: none — your app authenticates its own users and passes `author_id`/`author_name`
- **Admin auth**: master key in `Authorization: Bearer` header (tenant management only)

Commently trusts your app to verify users. It only verifies that your app is who it says it is.

## Deployment

Designed for Render.com but runs anywhere Node.js does.

| Service | Render Plan | Cost |
|---|---|---|
| commently-api | Starter | $7/mo |
| commently-db | PostgreSQL Basic | $7/mo |
| **Total** | | **$14/mo** |

## License

MIT
