<p align="center">
  <img src="https://cdn.prod.website-files.com/68e09cef90d613c94c3671c0/697e805a9246c7e090054706_logo_horizontal_grey.png" alt="Yeti" width="200" />
</p>

---

# app-pagebank

[![Yeti](https://img.shields.io/badge/Yeti-Application-blue)](https://yetirocks.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **[Yeti](https://yetirocks.com)** - The Performance Platform for Agent-Driven Development.
> Schema-driven APIs, real-time streaming, and vector search. From prompt to production.

Full-page caching proxy with origin server fallback. Fetches pages from an origin URL on cache miss, stores them with configurable TTL, and serves subsequent requests from the cache.

## Features

- Origin-fetch on cache miss with automatic caching
- Configurable TTL via `@table(expiration: 3600)`
- Content-type preservation
- Default resource catches all unmatched paths
- React admin UI for cache inspection

## APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/{path}` | Serve from cache or fetch from origin |
| `GET` | `/PageCache` | List all cached pages |
| `GET` | `/PageCache/{path}` | View cache entry metadata |
| `DELETE` | `/PageCache/{path}` | Purge a cached page |

## Installation

```bash
cd ~/yeti/applications
git clone https://github.com/yetirocks/app-pagebank.git
cd app-pagebank/source
npm install
npm run build
```

## Project Structure

```
app-pagebank/
├── config.yaml              # App configuration + origin URL
├── schemas/
│   └── schema.graphql       # PageCache table with TTL
├── resources/
│   └── page_cache.rs        # Origin fetch + cache logic
└── source/                  # React/Vite frontend
```

## Configuration

```yaml
name: app-pagebank
version: "1.0"
database: app-pagebank
rest: true

schemas:
  - schemas/schema.graphql

resources:
  - resources/*.rs

static_files:
  path: web
  route: /
  index: index.html
  notFound:
    file: index.html
    statusCode: 200
  build:
    sourceDir: source
    command: npm run build

# Origin server to fetch pages from on cache miss
origin:
  url: "https://www.example.com"
```

## Schema

**schema.graphql** - Cached pages with 1-hour TTL:
```graphql
type PageCache @table(expiration: 3600) @export {
  path: ID! @primaryKey
  pageContents: String
  contentType: String
  statusCode: Int
  cachedAt: String
}
```

## Development

```bash
cd source

# Install dependencies
npm install

# Start dev server with HMR
npm run dev

# Build for production
npm run build
```

---

Built with [Yeti](https://yetirocks.com) | The Performance Platform for Agent-Driven Development
