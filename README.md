# Facebook Post Scraper Actor

This repository is intended to become an **Apify Actor** for scraping a single Facebook post URL and returning a **structured result** containing:

- the post itself
- all discovered comments
- all discovered reactions on the post
- all discovered reactions on the comments
- an optional video recording of the scrape session

## Status

**Work in progress.**

The current codebase started from a generic Apify Playwright template and is still being aligned with the Actor contract described below. This README describes the **intended product behavior** and the architecture the project should converge to.

## Goal

Build a reusable Actor that:

1. accepts a Facebook post URL as input
2. scrapes the post, comments, and reactions
3. returns one structured dataset item per input URL
4. optionally stores a video artifact for the scrape run
5. works both locally and, in managed mode, in Docker / on the Apify platform

## Intended Input

The Actor should accept a single input object like this:

```json
{
  "url": "https://www.facebook.com/share/p/...",
  "browserMode": "cdp",
  "recordVideo": true
}
```

### Input fields

- `url` **required**  
  The Facebook post URL to scrape.

- `browserMode` optional  
  One of:
  - `cdp` — connect to an already running local Chrome session
  - `managed` — launch Playwright inside the Actor

- `recordVideo` optional  
  If enabled, the Actor records the session and stores the video as an artifact.

## Browser Modes

### `cdp`
Use this mode when scraping through a **real local Chrome session**.

This is useful for:
- authenticated scraping
- stealthier local runs
- development against an already logged-in browser profile

### `managed`
Use this mode when running as a portable Actor in:
- Docker
- CI
- Apify platform

In this mode, the Actor launches the browser itself using Playwright.

## Intended Output Model

For each input URL, the Actor should emit **exactly one dataset item**.

### Dataset item

```json
{
  "input": {
    "url": "https://www.facebook.com/share/p/..."
  },
  "scrape": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "ok",
    "scrapedAt": "2026-03-18T12:00:00.000Z",
    "browserMode": "cdp",
    "allCommentsLoaded": true,
    "allPostReactionsLoaded": true,
    "allCommentReactionsLoaded": true,
    "warnings": []
  },
  "post": {
    "id": "facebook-post-id",
    "url": "https://www.facebook.com/share/p/...",
    "author": {
      "name": "Page or User Name",
      "profileUrl": "https://facebook.com/..."
    },
    "text": "Post text",
    "publishedAt": null,
    "reactionSummary": {
      "total": 123,
      "byType": {
        "like": 80,
        "love": 20,
        "care": 0,
        "haha": 10,
        "wow": 5,
        "sad": 4,
        "angry": 4
      }
    },
    "reactions": [
      {
        "userName": "Max Mustermann",
        "profileUrl": "https://facebook.com/...",
        "type": "like"
      }
    ]
  },
  "comments": [
    {
      "id": "comment-1",
      "parentCommentId": null,
      "depth": 0,
      "author": {
        "name": "Erika Musterfrau",
        "profileUrl": "https://facebook.com/..."
      },
      "text": "Comment text",
      "publishedAt": null,
      "reactionSummary": {
        "total": 8,
        "byType": {
          "like": 7,
          "love": 1
        }
      },
      "reactions": [
        {
          "userName": "John Doe",
          "profileUrl": "https://facebook.com/...",
          "type": "like"
        }
      ]
    }
  ],
  "artifacts": {
    "video": {
      "present": true,
      "key": "recordings/550e8400-e29b-41d4-a716-446655440000.mp4",
      "contentType": "video/mp4",
      "localPath": "storage/key_value_stores/default/recordings/550e8400-e29b-41d4-a716-446655440000.mp4"
    }
  }
}
```

## Storage Conventions

The Actor should follow normal Apify storage conventions:

### Default dataset
Use the **default dataset** for the main structured scrape result.

- one input URL → one dataset item
- no binary data in dataset items

### Default key-value store
Use the **default key-value store** for artifacts such as video files.

Recommended naming:

- video key: `recordings/<jobId>.mp4`

The `jobId` must be a UUID generated per scrape job and used consistently across outputs so dataset rows and artifacts can be joined reliably.

## Intended Runtime Flow

1. Read Actor input
2. Generate a UUID `jobId`
3. Resolve browser mode (`cdp` or `managed`)
4. Open the target Facebook post URL
5. Extract:
   - post metadata
   - post reactions
   - all comments
   - reactions for each comment
6. Optionally record video
7. Store video in KVS if enabled
8. Emit one final dataset item containing:
   - input metadata
   - scrape metadata
   - post data
   - comment data
   - artifact references

## Development Principles

This project should avoid these anti-patterns:

- hardcoded target URLs in runtime code
- local-only assumptions without a configurable runtime mode
- macOS-only recording as the primary recording strategy
- splitting the main result across unrelated KVS entries
- undocumented output formats

## Planned Actor Surface

### Input schema
`.actor/input_schema.json` should match the runtime contract:
- `url`
- `browserMode`
- `recordVideo`

### Output schema
`.actor/output_schema.json` should describe **where outputs are stored**:
- default dataset for structured output
- default key-value store for video artifacts

### Dataset schema
`.actor/dataset_schema.json` should describe the result shape shown in Apify Console.

## Local development

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run start:dev
```

Build:

```bash
npm run build
```

## Docker goal

The long-term goal is that the Actor can run in Docker in **managed** mode without depending on:

- a manually started local Chrome on `localhost:9222`
- macOS-only screen recording infrastructure
- hardcoded test URLs

## Repository purpose in one sentence

This repository is for building an Apify Actor that turns a Facebook post URL into one complete, traceable scrape result plus optional artifacts.
