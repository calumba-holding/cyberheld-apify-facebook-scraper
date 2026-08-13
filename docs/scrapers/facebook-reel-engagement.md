# Facebook `reel-engagement`

## Purpose

Capture a Facebook reel's caption, comments/replies, post reactions, browser recording, and source video when available.

## Behavior

- accepts `/reel/<numeric-id>` URLs
- rewrites the reel to the equivalent `/watch/?v=<id>` extraction surface for authenticated and public sessions
- attempts Relay/GraphQL video extraction before DOM fallback
- merges visible Relay comments when DOM extraction is incomplete
- uses the standard engagement output contract
- marks missing comment/reaction surfaces as incomplete rather than confirmed empty
- passes the canonical watch URL to `yt-dlp`

## Command

```bash
node dist/main.js \
  --target facebook \
  --scraper reel-engagement \
  --target-url "https://www.facebook.com/reel/1324727872632161"
```

The central API detects `/reel/` URLs and selects `reel-engagement` automatically.