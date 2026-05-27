use yeti_sdk::prelude::*;

// Full-page cache with origin fetch on miss.
//
// GET /page?stats=true          - list cached pages
// GET /page?url=https://...     - serve from cache or fetch origin
// DELETE /page?url=https://...  - invalidate one
// DELETE /page?all=true         - invalidate all
resource!(PageCache {
    name = "page",
    get(ctx) => {
        // Stats endpoint
        if ctx.query("stats").is_some() {
            let table = ctx.table("PageCache")?;
            let records: Vec<Value> = table.get_all().await?;
            let pages: Vec<Value> = records.iter().map(|r| json!({
                "url": r["url"],
                "contentType": r["contentType"],
                "statusCode": r["statusCode"],
                "cachedAt": r["cachedAt"],
                "size": r["pageContents"].as_str().map(|s| s.len()).unwrap_or(0)
            })).collect();
            return ok(json!({"cachedPages": records.len(), "pages": pages}));
        }

        // Require ?url= parameter
        let target_url = match ctx.query("url") {
            Some(u) => u.to_string(),
            None => return bad_request("Missing ?url= parameter"),
        };

        let table = ctx.table("PageCache")?;

        // Cache hit
        if let Some(record) = table.get(&target_url).await? {
            let ct = record["contentType"].as_str().unwrap_or("text/html");
            let html = record["pageContents"].as_str().unwrap_or("");
            return reply()
                .header("x-cache", "HIT")
                .header("x-cached-at", record["cachedAt"].as_str().unwrap_or(""))
                .type_header(ct)
                .send(html.as_bytes().to_vec());
        }

        // Cache miss - fetch from origin
        tracing::info!("Cache miss, fetching {}", target_url);

        let response = fetch(&target_url).send()?;

        let ct = response.header("content-type").unwrap_or("text/html").to_string();
        let now = unix_timestamp()?.to_string();

        // Store in cache using the full URL as both the primary key (id)
        // and the queryable `url` index. The auto-CRUD path on
        // /app-pagebank/api/pagecache stores under `id`; storing the URL
        // here keeps the custom resource and auto-CRUD in agreement.
        let record = json!({
            "id": target_url,
            "url": target_url,
            "pageContents": response.body,
            "contentType": ct,
            "statusCode": response.status,
            "cachedAt": now
        });
        table.put(&target_url, record).await?;

        let cache_status = if response.ok() { "MISS" } else { "ORIGIN_ERROR" };

        reply()
            .header("x-cache", cache_status)
            .header("x-origin-status", &response.status.to_string())
            .code(if response.ok() { 200 } else { 502 })
            .type_header(&ct)
            .send(response.body.into_bytes())
    },
    delete(ctx) => {
        let table = ctx.table("PageCache")?;

        // Delete all
        if ctx.query("all").is_some() {
            let records: Vec<Value> = table.get_all().await?;
            let count = records.len();
            for record in &records {
                if let Some(key) = record["url"].as_str() {
                    let _ = table.delete(key).await;
                }
            }
            return ok(json!({"message": format!("Deleted {} cached pages", count), "count": count}));
        }

        // Delete one by ?url=
        let target_url = match ctx.query("url") {
            Some(u) => u.to_string(),
            None => return bad_request("Missing ?url= parameter"),
        };

        if table.does_exist(&target_url).await? {
            table.delete(&target_url).await?;
            ok(json!({"message": format!("Invalidated {}", target_url)}))
        } else {
            not_found(&format!("No cache entry for {}", target_url))
        }
    }
});
