# Changelog

## Unreleased

- Added a `comment-reactions` Facebook scraper that targets one `comment_id`, extracts all reactions for that comment, and fails the result when the target comment cannot be found.
- Added a local-first Facebook scraping CLI with persistent Chrome profile login, JSON stdout output, parallel URL processing, and optional browser video capture.
- Replaced the earlier Apify actor runtime with a direct local scraper workflow built around `node dist/main.js`.
- Improved browser video artifact handling to keep a single valid final `.webm`, clean up ghost recordings, and handle artifact finalization more reliably.
- Added support for invoking the compiled entrypoint as either `node dist/main.js ...` or `node dist/main.js scrape ...`.
