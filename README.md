<p align="center">
  <img src="https://cdn.prod.website-files.com/68e09cef90d613c94c3671c0/697e805a9246c7e090054706_logo_horizontal_grey.png" alt="Yeti" width="200" />
</p>

---

# app-pagebank

[![Yeti](https://img.shields.io/badge/Yeti-Application-blue)](https://yetirocks.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **[Yeti](https://yetirocks.com)** - The Performance Platform for Agent-Driven Development.
> Schema-driven APIs, real-time streaming, and vector search. From prompt to production.

**A full-page caching proxy with origin-fetch on miss.** Fast, transparent, zero-config.

PageBank fetches pages from any origin URL on first request, stores them with automatic TTL expiration, and serves subsequent requests directly from cache. One resource file, one schema table, one environment variable. No Varnish, no Nginx proxy_cache, no Redis. A single yeti application replaces an entire caching layer.

---

## Why PageBank

Edge caching shouldn't require a CDN account, a reverse proxy config, or a separate caching tier. Traditional setups demand Varnish VCL rules, Nginx proxy_cache directives, or CloudFront distributions -- each with its own configuration language, deployment pipeline, and failure modes.

PageBank collapses that into a single yeti application:

- **Origin-fetch on cache miss** -- requests to PageBank that miss the cache are transparently proxied to the origin URL, cached, and returned in one round-trip. No warm-up step, no manual priming.
- **Automatic TTL expiration** -- cached pages expire after a configurable duration (default 1 hour) using yeti's built-in `@table(expiration)` directive. No cron jobs, no manual invalidation schedules.
- **Content-type preservation** -- the origin's `Content-Type` header is stored alongside the page content and served back on cache hits. HTML, JSON, XML, images -- all handled correctly.
- **Cache transparency headers** -- every response includes `X-Cache: HIT` or `X-Cache: MISS` and `X-Cached-At` timestamps so you always know where content came from.
- **Instant invalidation** -- purge a single URL or wipe the entire cache with one DELETE request. No propagation delay, no stale-while-revalidate complexity.
- **Visual comparison UI** -- built-in React dashboard loads origin and cached versions side-by-side with millisecond timing, showing the exact speedup factor.
- **Single binary deployment** -- compiles into a native Rust plugin. No Node.js runtime in production, no npm, no Docker. Loads with yeti in seconds.

---

## Quick Start

### 1. Install

```bash
cd ~/yeti/applications
git clone https://github.com/yetirocks/app-pagebank.git
```

Restart yeti. PageBank compiles automatically on first load (~2 minutes) and is cached for subsequent starts (~10 seconds).

### 2. Fetch a page (cache miss)

```bash
curl -s -D - "https://localhost:9996/app-pagebank/page?url=https://example.com"
```

Response headers:
```
HTTP/2 200
content-type: text/html
x-cache: MISS
x-origin-status: 200
```

Response body:
```html
<!doctype html>
<html>
<head><title>Example Domain</title></head>
...
</html>
```

The page was fetched from `https://example.com`, stored in the cache, and returned. The `X-Cache: MISS` header confirms this was an origin fetch.

### 3. Fetch the same page (cache hit)

```bash
curl -s -D - "https://localhost:9996/app-pagebank/page?url=https://example.com"
```

Response headers:
```
HTTP/2 200
content-type: text/html
x-cache: HIT
x-cached-at: 1743292800
```

Same content, but now served from cache. The `X-Cache: HIT` header confirms no origin request was made. Response times drop from hundreds of milliseconds to single-digit milliseconds.

### 4. View cache statistics

```bash
curl -s "https://localhost:9996/app-pagebank/page?stats=true" | jq
```

Response:
```json
{
  "cachedPages": 1,
  "pages": [
    {
      "url": "https://example.com",
      "contentType": "text/html",
      "statusCode": 200,
      "cachedAt": "1743292800",
      "size": 1256
    }
  ]
}
```

### 5. Invalidate a cached page

```bash
curl -s -X DELETE "https://localhost:9996/app-pagebank/page?url=https://example.com" | jq
```

Response:
```json
{
  "message": "Invalidated https://example.com"
}
```

### 6. Purge the entire cache

```bash
curl -s -X DELETE "https://localhost:9996/app-pagebank/page?all=true" | jq
```

Response:
```json
{
  "message": "Deleted 3 cached pages",
  "count": 3
}
```

---

## Architecture

```
Client Request
    |
    v
+--------------------------------------------------+
|               app-pagebank                        |
|                                                   |
|   GET /page?url=https://...                       |
|       |                                           |
|       +---> PageCache table lookup (RocksDB)      |
|       |         |              |                  |
|       |       HIT            MISS                 |
|       |         |              |                  |
|       |    Return cached    fetch() to origin     |
|       |    content with     server via curl        |
|       |    X-Cache: HIT         |                 |
|       |         |          Store response in      |
|       |         |          PageCache table         |
|       |         |               |                 |
|       |         |          Return content with    |
|       |         |          X-Cache: MISS           |
|       |         |               |                 |
|       v         v               v                 |
|   +------------------------------------------+   |
|   |     Response with cache headers           |   |
|   +------------------------------------------+   |
|                                                   |
|   GET /page?stats=true --> cache inventory JSON   |
|   DELETE /page?url=... --> purge single entry     |
|   DELETE /page?all=true -> purge entire cache     |
|                                                   |
|   @table(expiration: 3600) --> auto-TTL cleanup   |
+--------------------------------------------------+
    |
    v
Yeti (embedded RocksDB, automatic TTL expiration)
```

**Cache hit path:** Client request -> PageCache table lookup by URL key -> found -> return stored content with original Content-Type and `X-Cache: HIT`.

**Cache miss path:** Client request -> PageCache table lookup -> not found -> `fetch()` origin URL via curl subprocess -> store response (content, content-type, status code, timestamp) -> return content with `X-Cache: MISS`.

**Expiration path:** RocksDB TTL compaction automatically removes entries older than 3600 seconds. No background job, no sweep timer.

---

## Features

### Origin Fetch (GET /page?url=...)

Transparent caching proxy for any URL:

```bash
# Fetch and cache a page
curl "https://localhost:9996/app-pagebank/page?url=https://news.ycombinator.com"

# Fetch and cache a JSON API
curl "https://localhost:9996/app-pagebank/page?url=https://api.github.com/repos/yetirocks/yeti"
```

The resource handler:
1. Checks the PageCache table for an existing entry keyed by the full URL
2. On **HIT**: returns the cached `pageContents` with the stored `contentType` header
3. On **MISS**: calls `fetch()` (yeti-sdk's curl-based HTTP client), stores the response, and returns it
4. On **origin error**: caches the error response and returns HTTP 502 with `X-Cache: ORIGIN_ERROR`

Response headers on every request:

| Header | Value | Description |
|--------|-------|-------------|
| `X-Cache` | `HIT`, `MISS`, or `ORIGIN_ERROR` | Cache status |
| `X-Cached-At` | Unix timestamp | When the entry was cached (HIT only) |
| `X-Origin-Status` | HTTP status code | Origin server's response code (MISS only) |
| `Content-Type` | Preserved from origin | Original content type |

### Cache Statistics (GET /page?stats=true)

Returns a JSON inventory of all cached pages without their content bodies:

```bash
curl -s "https://localhost:9996/app-pagebank/page?stats=true" | jq
```

Each entry includes `url`, `contentType`, `statusCode`, `cachedAt`, and `size` (byte count of cached content). Useful for monitoring cache utilization and debugging.

### Single Invalidation (DELETE /page?url=...)

Purge a single cached page by its URL:

```bash
curl -X DELETE "https://localhost:9996/app-pagebank/page?url=https://example.com"
```

Returns 404 if the URL is not in the cache. The next GET for that URL triggers a fresh origin fetch.

### Bulk Invalidation (DELETE /page?all=true)

Purge the entire cache:

```bash
curl -X DELETE "https://localhost:9996/app-pagebank/page?all=true"
```

Returns the count of deleted entries. Useful after origin deployments or configuration changes.

### Automatic TTL Expiration

The `@table(expiration: 3600)` directive in the schema configures RocksDB TTL compaction. Entries older than 3600 seconds (1 hour) are automatically removed during compaction cycles. No application code required -- this is handled at the storage layer.

To change the TTL, edit `schemas/schema.graphql`:

```graphql
# 24-hour cache
type PageCache @table(expiration: 86400) @export {
  ...
}
```

### REST CRUD (auto-generated)

Full CRUD on the PageCache table is auto-generated from the `@export` schema directive:

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/app-pagebank/PageCache` | GET, POST | List/create cache entries |
| `/app-pagebank/PageCache/{url}` | GET, PUT, DELETE | Read/update/delete a cache entry |

These endpoints operate on the raw table data and are separate from the `/page` resource which handles the proxy logic.

### Real-Time Streaming (auto-generated)

Real-time cache updates are available via SSE and MQTT from the `@export` directive:

```bash
# SSE -- watch for new cache entries
curl "https://localhost:9996/app-pagebank/PageCache?stream=sse"

# MQTT -- subscribe to cache changes
mosquitto_sub -t "app-pagebank/PageCache" -h localhost -p 8883
```

### Visual Comparison UI

The built-in React dashboard provides a side-by-side comparison view:

- **Left panel** -- lists all cached pages with URL, MIME type, size, and status code
- **Right panel** -- loads origin and cached versions in parallel iframes with millisecond timing
- **Speed badge** -- shows the speedup factor (e.g., "12.3x faster") when the cache outperforms origin
- **Bulk delete** -- confirmation modal for purging the entire cache

Access the UI at `https://localhost:9996/app-pagebank/`.

### MCP Tools (auto-generated)

MCP tools for PageCache table operations are auto-generated from the `@export` schema. Any MCP-compatible agent (Claude Code, Cursor, Windsurf) can discover and use them via the standard MCP protocol at `POST /app-pagebank/mcp`.

---

## Data Model

### PageCache Table

| Field | Type | Key | Description |
|-------|------|-----|-------------|
| `url` | ID! | Primary key | The full URL used as cache key |
| `pageContents` | String | -- | Raw page content (HTML, JSON, etc.) |
| `contentType` | String | -- | MIME type from origin response |
| `statusCode` | Int | -- | HTTP status code from origin |
| `cachedAt` | String | -- | Unix timestamp of cache insertion |

**TTL:** 3600 seconds (1 hour) via `@table(expiration: 3600)`. Configurable in schema.

**Database:** Dedicated `app-pagebank` RocksDB instance via `@table(database: "app-pagebank")`.

---

## Configuration

### config.yaml

```yaml
name: "Page Bank"
app_id: "app-pagebank"
version: "1.0"
schemas:
  - schemas/schema.graphql

resources:
  - resources/*.rs

static_files:
  path: web
  spa: true
  build:
    sourceDir: source
    command: npm run build

env:
  PAGEBANK_ORIGIN_URL: "https://www.example.com"
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PAGEBANK_ORIGIN_URL` | `https://www.example.com` | Default origin server URL (currently informational -- the `?url=` parameter controls per-request origin) |

### Schema

```graphql
type PageCache @table(expiration: 3600, database: "app-pagebank") @export {
  url: ID! @primaryKey
  pageContents: String
  contentType: String
  statusCode: Int
  cachedAt: String
}
```

### Tuning the TTL

Edit the `expiration` value in `schemas/schema.graphql`:

| Use Case | Expiration | Value |
|----------|-----------|-------|
| Real-time API proxy | 60 seconds | `@table(expiration: 60)` |
| Standard page cache | 1 hour | `@table(expiration: 3600)` |
| Long-lived content | 24 hours | `@table(expiration: 86400)` |
| Semi-permanent cache | 7 days | `@table(expiration: 604800)` |

---

## Project Structure

```
app-pagebank/
├── config.yaml              # App configuration + origin URL
├── schemas/
│   └── schema.graphql       # PageCache table with TTL + auto-export
├── resources/
│   └── page_cache.rs        # Origin fetch + cache logic (101 lines)
├── source/                  # React/Vite frontend
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx           # Side-by-side comparison UI
│       ├── main.tsx          # Entry point
│       ├── theme.ts          # Yeti design tokens
│       └── *.css             # Styles
└── web/                     # Built static assets (served by yeti)
```

---

## Authentication

PageBank uses yeti's built-in auth system. In development mode, all endpoints are accessible without authentication. In production:

- **JWT**, **Basic Auth**, and **OAuth** supported (configured via yeti-auth)
- The `/page` resource endpoint follows standard yeti auth enforcement
- The `PageCache` auto-generated CRUD endpoints follow the same auth rules
- SSE and MQTT subscriptions require authentication in production

No special auth configuration is needed in PageBank itself -- it inherits the authentication policy from the yeti instance it runs on.

---

## Development

### Frontend

```bash
cd ~/yeti/applications/app-pagebank/source

# Install dependencies
npm install

# Start dev server with HMR
npm run dev

# Build for production (output to ../web/)
npm run build
```

### Resource

Edit `resources/page_cache.rs` directly. On yeti restart, the plugin recompiles automatically if source has changed. To force recompilation:

```bash
rm -rf ~/yeti/cache/builds/app-pagebank/src/
```

---

## Comparison

| | app-pagebank | Varnish | Nginx proxy_cache | CloudFront |
|---|---|---|---|---|
| **Setup** | Clone + restart yeti | Install + write VCL | Edit nginx.conf | AWS account + distribution |
| **Config language** | YAML + GraphQL schema | VCL (custom DSL) | Nginx directives | JSON/CloudFormation |
| **Invalidation** | DELETE request | BAN/PURGE VCL rules | proxy_cache_purge module | Invalidation API (charges apply) |
| **TTL config** | One schema directive | VCL `beresp.ttl` | `proxy_cache_valid` | Cache behaviors |
| **Monitoring** | Built-in stats endpoint + UI | varnishstat/varnishlog | access.log parsing | CloudWatch (separate service) |
| **Real-time updates** | Native SSE + MQTT | None | None | None |
| **Admin UI** | Built-in React dashboard | Varnish Dashboard (3rd party) | None | AWS Console |
| **Auth** | Built-in JWT/Basic/OAuth | None (separate layer) | None (separate layer) | IAM + Signed URLs |
| **MCP integration** | Auto-generated from schema | None | None | None |
| **Deployment** | Single binary plugin | Separate daemon | Separate daemon | Managed service |

---

Built with [Yeti](https://yetirocks.com) | The Performance Platform for Agent-Driven Development
