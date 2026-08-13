# Facebook profile scraper

## Command

```bash
node dist/main.js \
  --target facebook \
  --scraper profile-scraper \
  --target-url "https://www.facebook.com/example/" \
  --max-posts 20
```

An authenticated persistent profile is required.

## Output

The standard scrape-run envelope contains `results[].profile` with:

- profile URL, username, display name, description, and profile picture
- discovered external links
- overview/About extraction
- extracted top-level tab contents
- extracted More-menu section contents
- recent post records, requested count, and extracted count
- non-fatal section errors
- a profile screenshot artifact

`SUCCEEDED` requires the requested recent-post count and no section errors. Otherwise useful profile data is returned as `PARTIAL`.

The Docker `profile` command routes through this same standard CLI and JSON contract.