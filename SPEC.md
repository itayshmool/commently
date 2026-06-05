# Commently — Technical Specification

## Overview

Commently is a generic, self-hosted comments-as-a-service platform. It provides a tenant-based REST API that any application can integrate with to add threaded, context-anchored comments to any resource.

Commently is **resource-agnostic** — it doesn't know what a "deck", "blog post", or "lesson" is. It stores comments against opaque identifiers that the consuming application defines.

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐
│  Your App       │         │  Commently Service   │
│  (DeckDrop,     │ ──────► │                      │
│   Blog, etc.)   │ X-API-Key│  Express + PostgreSQL│
│                 │ ◄────── │                      │
└─────────────────┘         └──────────────────────┘
```

- **Runtime**: Node.js, Express
- **Database**: PostgreSQL (via `pg`)
- **Auth**: API key per tenant (server-to-server)
- **Deployment**: Render.com (or any Node host)

Commently is a stateless HTTP service. No WebSocket, no Redis, no background workers. It scales horizontally by running multiple instances behind a load balancer — all state lives in PostgreSQL.

## Core Concepts

### Tenant

A tenant represents a consuming application. Each tenant gets an API key used to authenticate all requests. One tenant = one project (e.g., "deckdrop", "my-blog").

### Resource

An opaque identifier (`resource_id`) representing the thing being commented on. Commently doesn't interpret this — it's a string your app provides. Examples:
- A deck UUID: `"d4e5f6a7-b8c9-..."`
- A blog post slug: `"how-to-scale-postgres"`
- A lesson ID: `"lesson-42"`

### Context Key

An optional sub-anchor within a resource (`context_key`). Used to attach comments to a specific location within the resource. Examples:
- Slide in a deck: `"slide:3"`
- Paragraph in a blog post: `"paragraph:12"`
- Step in a tutorial: `"step:setup-db"`

The format is a free-form string — the consuming app defines the convention.

### Comment

A text body attached to a resource, optionally anchored to a context key, optionally threaded via `parent_id`.

## Data Model

### `tenants`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, auto-generated |
| `name` | TEXT | Unique, human-readable identifier |
| `api_key_hash` | TEXT | SHA-256 hash of the API key |
| `api_key_prefix` | TEXT | First 8 chars of the key (for identification) |
| `created_at` | TIMESTAMPTZ | Auto-set |

The raw API key is returned once at creation and never stored.

### `comments`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, auto-generated |
| `tenant_id` | UUID | FK → tenants.id |
| `resource_id` | TEXT | Opaque identifier from the consuming app |
| `context_key` | TEXT | Nullable. Sub-anchor within the resource |
| `author_id` | TEXT | Opaque. The consuming app's user identifier |
| `author_name` | TEXT | Display name |
| `author_role` | TEXT | Nullable. e.g., "owner", "viewer", "admin" |
| `body` | TEXT | Comment content |
| `parent_id` | UUID | Nullable. FK → comments.id (for threads) |
| `created_at` | TIMESTAMPTZ | Auto-set |
| `updated_at` | TIMESTAMPTZ | Auto-set on update |
| `deleted_at` | TIMESTAMPTZ | Nullable. Soft delete |

### Indexes

```sql
CREATE INDEX idx_comments_resource ON comments (tenant_id, resource_id, deleted_at);
CREATE INDEX idx_comments_context  ON comments (tenant_id, resource_id, context_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_parent   ON comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_comments_author   ON comments (tenant_id, author_id);
```

## API

All endpoints require the `X-API-Key` header with a valid tenant API key.

All responses follow the shape:
```json
{
  "success": true,
  "data": { ... }
}
```

Error responses:
```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Comment not found" }
}
```

### Tenant Management

These endpoints are authenticated via a master admin key (`ADMIN_API_KEY` env var).

#### `POST /api/tenants`

Create a new tenant.

**Request:**
```json
{
  "name": "deckdrop"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "deckdrop",
    "api_key": "sk_commently_abc123..."
  }
}
```

The `api_key` is returned only in this response. Store it securely.

#### `POST /api/tenants/:id/rotate-key`

Rotate the API key for a tenant. Invalidates the previous key immediately.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "api_key": "sk_commently_newkey..."
  }
}
```

### Comments

All endpoints below require `X-API-Key` with a valid tenant key. All operations are scoped to the authenticated tenant.

#### `POST /api/comments`

Create a comment.

**Request:**
```json
{
  "resource_id": "deck-uuid-123",
  "context_key": "slide:3",
  "author_id": "viewer@gmail.com",
  "author_name": "Dana",
  "author_role": "viewer",
  "body": "Love this chart!",
  "parent_id": null
}
```

Required fields: `resource_id`, `author_id`, `author_name`, `body`.
Optional fields: `context_key`, `author_role`, `parent_id`.

**Validation:**
- `body` must be 1-5000 characters
- `parent_id`, if provided, must reference an existing comment on the same resource
- `context_key` max 200 characters
- `author_id` max 500 characters
- `resource_id` max 500 characters

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "resource_id": "deck-uuid-123",
    "context_key": "slide:3",
    "author_id": "viewer@gmail.com",
    "author_name": "Dana",
    "author_role": "viewer",
    "body": "Love this chart!",
    "parent_id": null,
    "created_at": "2026-06-05T10:30:00Z"
  }
}
```

#### `GET /api/comments`

List comments for a resource.

**Query parameters:**
| Param | Required | Description |
|---|---|---|
| `resource_id` | Yes | The resource to fetch comments for |
| `context_key` | No | Filter to a specific context (e.g., `slide:3`) |
| `cursor` | No | Pagination cursor (comment UUID) |
| `limit` | No | Max results, default 50, max 100 |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "comments": [
      {
        "id": "uuid",
        "resource_id": "deck-uuid-123",
        "context_key": "slide:3",
        "author_id": "viewer@gmail.com",
        "author_name": "Dana",
        "author_role": "viewer",
        "body": "Love this chart!",
        "parent_id": null,
        "created_at": "2026-06-05T10:30:00Z",
        "replies": [
          {
            "id": "uuid",
            "author_id": "itay@wix.com",
            "author_name": "Itay",
            "author_role": "owner",
            "body": "Thanks! Data is from Q3 report",
            "parent_id": "parent-uuid",
            "created_at": "2026-06-05T10:32:00Z"
          }
        ]
      }
    ],
    "pagination": {
      "next_cursor": "uuid-of-last-item",
      "has_more": false
    }
  }
}
```

Comments are returned in chronological order. Replies are nested under their parent (one level deep — no nested threads).

#### `GET /api/comments/counts`

Get comment counts, optionally grouped by context key.

**Query parameters:**
| Param | Required | Description |
|---|---|---|
| `resource_id` | Yes | Single resource ID |
| `resource_ids` | No | Comma-separated list (batch mode, max 50) |
| `group_by` | No | Set to `context_key` to get per-context counts |

**Response — single resource, grouped:**
```json
{
  "success": true,
  "data": {
    "total": 8,
    "groups": {
      "slide:0": 2,
      "slide:3": 5,
      "slide:7": 1
    }
  }
}
```

**Response — batch mode:**
```json
{
  "success": true,
  "data": {
    "counts": {
      "deck-uuid-123": 8,
      "deck-uuid-456": 3
    }
  }
}
```

#### `DELETE /api/comments/:id`

Soft-delete a comment. The consuming app is responsible for authorization (e.g., only the author or resource owner can delete).

**Request headers:**
```
X-API-Key: sk_commently_abc...
X-Author-Id: viewer@gmail.com    (optional, for audit logging)
```

**Response (200):**
```json
{
  "success": true,
  "data": { "id": "comment-uuid", "deleted_at": "2026-06-05T11:00:00Z" }
}
```

Deleted comments are excluded from all list/count queries. Their replies remain visible but show `parent_id` pointing to a deleted comment — the consuming app can render this as "[deleted]".

## Authentication Model

### Tenant API Keys

- Format: `sk_commently_<32 random chars>`
- Stored as SHA-256 hash + 8-char prefix
- Passed via `X-API-Key` header on every request
- All queries are scoped to the tenant owning the key

### Admin Key

- Set via `ADMIN_API_KEY` environment variable
- Used only for tenant management endpoints (`POST /api/tenants`, key rotation)
- Passed via `Authorization: Bearer <key>` header

### What Commently does NOT do

- **User authentication** — the consuming app verifies its users and passes `author_id`/`author_name`
- **Resource authorization** — the consuming app decides who can comment on what resource
- **User management** — no user accounts, sessions, or passwords

## Configuration

Environment variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_API_KEY` | Yes | Master key for tenant management |
| `PORT` | No | Server port (default: 3002) |
| `NODE_ENV` | No | `production` or `development` |

## Deployment

### Render.com

Single web service + PostgreSQL database:

- **commently-api**: Node.js, Starter plan ($7/mo)
- **commently-db**: PostgreSQL, Basic 256MB ($7/mo)
- **Total**: ~$14/mo

For high availability, run 2+ instances behind Render's load balancer.

### Scaling Path

| Stage | Traffic | Setup |
|---|---|---|
| Starting | <1k req/min | 1 instance + PostgreSQL |
| Growing | 1-10k req/min | 2+ instances, add read replica |
| Scale | 10k+ req/min | Add Redis cache for counts, CDN for reads |

The service is stateless — horizontal scaling requires no code changes, only more instances.

## Integration Example: DeckDrop

```
DeckDrop registers as tenant "deckdrop" → gets sk_commently_abc...

Viewer on slide 3 writes a comment:
  Browser → DeckDrop backend (checks viewer auth + deck access)
           → Commently API (X-API-Key + comment payload)
           → PostgreSQL → response back

DeckDrop maps:
  resource_id  = deck.id (UUID)
  context_key  = "slide:{index}"
  author_id    = viewer's Google email
  author_role  = "owner" | "viewer"
```

DeckDrop's proxy layer handles all permission checks using its own `isViewerAllowed()` logic. Commently never knows about decks, slides, or viewer permissions.

## Future Considerations (not in v1)

- **Webhooks**: notify the consuming app on new comments (for email notifications, Slack, etc.)
- **Reactions**: emoji reactions on comments (separate table, aggregate counts)
- **Editing**: allow comment body updates within a time window
- **Rate limiting**: per-tenant and per-author rate limits
- **Export**: bulk export comments for a resource or tenant
