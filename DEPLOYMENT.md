# Deployment

Commently runs on Render.com with three services and a custom domain.

## Render Services

| Service | Type | Plan | Render URL | Dashboard |
|---|---|---|---|---|
| commently-api | Web Service | Starter ($7/mo) | commently-api.onrender.com | [dashboard](https://dashboard.render.com/web/srv-d8h9aqc8aovs73f0c2j0) |
| commently-db | PostgreSQL | Basic 256MB ($7/mo) | Internal only | [dashboard](https://dashboard.render.com/d/dpg-d8h9al7lk1mc73e8mkj0-a) |
| commently-docs | Static Site | Free | commently-docs.onrender.com | [dashboard](https://dashboard.render.com/static/srv-d8h9dqmk1jcs739mpqu0) |

**Total cost: ~$14/mo**

## Custom Domain

Domain: **commently.live** (registered on Namecheap)

| URL | Service | Purpose |
|---|---|---|
| https://commently.live | commently-docs | Landing page |
| https://www.commently.live | commently-docs | Landing page (www) |
| https://api.commently.live | commently-api | API |

## DNS Records (Namecheap)

| Type | Host | Value |
|---|---|---|
| CNAME | @ | commently-docs.onrender.com |
| CNAME | www | commently-docs.onrender.com |
| CNAME | api | commently-api.onrender.com |

## Environment Variables (commently-api)

| Variable | Value |
|---|---|
| DATABASE_URL | (internal Render PostgreSQL URL) |
| ADMIN_API_KEY | (set via dashboard) |
| NODE_ENV | production |
| CORS_ORIGINS | https://commently-docs.onrender.com,https://commently.live,https://www.commently.live |
| COMMENT_EDIT_WINDOW_MINUTES | 15 |

## Deploy Process

All three services have **auto-deploy enabled**. Pushing to `main` triggers:

1. **commently-api**: `npm install && npm run db:migrate` → `npm start`
2. **commently-docs**: serves `site/` directory directly (no build)

## SSL

Render auto-provisions Let's Encrypt SSL certificates for all custom domains. Certificates renew automatically.
