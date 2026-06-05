# Commently Authentication

Commently uses API keys for authentication. There are no OAuth flows, sessions, or user accounts.

## Tenant API Key

Every request to the Comments API requires an `X-API-Key` header with a valid tenant key.

```
X-API-Key: sk_commently_<base64url-encoded-key>
```

Keys are issued when a tenant is created via the admin API. They are shown once and stored as SHA-256 hashes. If lost, rotate the key via the admin API.

### How to obtain a key

1. An administrator creates a tenant using the admin API:
   ```
   POST /api/tenants
   Authorization: Bearer <admin-key>
   Content-Type: application/json

   {"name": "your-app-name"}
   ```
2. The response includes the `api_key` field — store it securely.
3. Use this key in the `X-API-Key` header for all subsequent requests.

### Key rotation

```
POST /api/tenants/:id/rotate-key
Authorization: Bearer <admin-key>
```

The old key is invalidated immediately. Update your application with the new key.

## Admin Key

Tenant management endpoints require a master admin key, set via the `ADMIN_API_KEY` environment variable. Pass it in the `Authorization` header:

```
Authorization: Bearer <admin-key>
```

Admin endpoints: create/list/delete tenants, rotate keys, view stats, export data.

## What Commently does NOT do

- **User authentication** — your app verifies its own users and passes `author_id` / `author_name`
- **User management** — no user accounts, sessions, or passwords
- **OAuth/OIDC** — not supported; API key auth only

## Rate Limits

- Tenant endpoints: 200 requests/minute per API key
- Admin endpoints: 30 requests/minute per IP

Exceeding the limit returns `429 Too Many Requests` with error code `RATE_LIMITED`.
