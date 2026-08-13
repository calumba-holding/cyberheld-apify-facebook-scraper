import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defaultProfileRootDir } from '../common/profile.js';
import { SUPPORTED_TARGETS } from '../registry.js';

export const defaultChromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const defaultArtifactRootDir = join(tmpdir(), 'scrape-artifacts');

export const helpText = `scrape

Usage:
  scrape --target <target> --scraper <scraper> --target-url <url> [--target-url <url> ...] [options]
  scrape profile login --target <target> [options]
  scrape profile path --target <target>
  scrape watch --config <path> [options]

Direct invocation:
  node dist/main.js [scrape] --target <target> --scraper <scraper> --target-url <url> [--target-url <url> ...] [options]
  node dist/main.js [scrape] profile login --target <target> [options]
  node dist/main.js [scrape] profile path --target <target>
  node dist/main.js watch --config <path> [options]

Required for scraping:
  --target <target>          Target platform (${SUPPORTED_TARGETS.join(', ')})
  --scraper <scraper>        Scraper name, e.g. post-engagement, post-screenshot
  --target-url <url>         Target resource URL (repeatable)

Options:
  --concurrency <n>          Number of tabs to scrape in parallel (default: 1, max: 32)
  --public-session          Use a persistent non-login Facebook profile for public scraping
  --guest-session           Use a temporary Chrome session without the saved target profile
  --screen-video             Force-enable Playwright browser video recording
  --no-screen-video          Disable Playwright browser video recording (default is on)
  --full-page-screenshot     Also capture a full-page PNG (post-screenshot)
  --no-expand-comments       Skip opening comments and comment-scroll screenshots (Instagram post-screenshot)
  --urls-file <path>         File with one target URL per line (for batch runs with --concurrency)
  --no-download              Disable source-video download for Facebook watch/video runs
  --output-file <path>       Also write the final JSON to a file
  --chrome-executable <path> Chrome executable path
  --profile-root-dir <dir>   Root dir for persistent target profiles
  --artifact-root-dir <dir>  Root dir for screenshots/artifacts (default: SCRAPE_ARTIFACT_ROOT_DIR or temp)
  --wait-after-navigation-ms <ms>
                             Extra wait after navigation (default: 5000)
  --request-timeout-secs <s> Navigation timeout (default: 240)
  --regenerate-script        Skip the saved self-healing extraction script for this run
  --workers <n>              Number of parallel Chrome worker processes (default: 1)
  --worker-concurrency <n>   Tabs per worker process when --workers > 1 (default: 4)
  --worker-start-delay-ms <ms>
                             Stagger delay between worker starts (default: 2000)
  --max-retries <n>          Per-item retry attempts on transient failure or zero screenshots (default: 2, max: 5)
  --item-delay-ms <ms>       Delay before scraping each item, per tab (default: 0)
  --max-posts <n>            Profile scraper recent-post limit (default: 20, max: 100)
  --verbose                  Print debug logs to stderr
  -h, --help                 Show help
  --version                  Show version

Output:
  - stdout: final JSON
  - stderr: logs and errors
  - JSON file: only when --output-file is set
  - video artifact: written by default unless --no-screen-video is set
  - source-video download: enabled by default for Facebook watch/video post-engagement runs unless --no-download is set

Notes:
  - comment-reactions requires a Facebook URL containing ?comment_id=...
  - --public-session and --guest-session are currently supported only for --target facebook
  - --workers > 1 forks separate Chrome processes; workers * worker-concurrency must not exceed 100
  - for persistent-profile and --public-session runs, each worker N uses <profile-root-dir>/worker-N and must be
    logged in ahead of time via: scrape profile login --target <target> --profile-root-dir <profile-root-dir>/worker-N
  - failed items retry up to --max-retries times with exponential backoff (1s, 2s, 4s... capped at 30s), except
    login-wall/blocked-page failures, which fail fast without retrying

Examples:
  scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..."
  scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..." --public-session
  scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..." --guest-session
  scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/share/v/..." --no-download
  scrape --target facebook --scraper comment-reactions --target-url "https://www.facebook.com/...?...&comment_id=123456"
  scrape --target facebook --scraper profile-scraper --target-url "https://www.facebook.com/example" --max-posts 20
  scrape --target instagram --scraper post-engagement --target-url "https://www.instagram.com/p/..."
  scrape --target instagram --scraper profile-scraper --target-url "https://www.instagram.com/example/"
  scrape --target instagram --scraper post-screenshot --target-url "https://www.instagram.com/reel/SHORTCODE/"
  scrape --target instagram --scraper post-screenshot --target-url "https://www.instagram.com/reel/A" --target-url "https://www.instagram.com/reel/B" --concurrency 2
  scrape --target facebook --scraper post-screenshot --target-url "https://www.facebook.com/..." --public-session
  scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/a" --target-url "https://www.facebook.com/b" --concurrency 2
  scrape --target instagram --scraper post-screenshot --urls-file ./jobs/reels.txt --workers 10 --worker-concurrency 10 --no-screen-video
  scrape profile login --target facebook
  scrape profile login --target instagram
  scrape profile path --target facebook
  scrape profile path --target instagram
  scrape watch --config farm/config/worker-1.json
  scrape watch --config farm/config/worker-1.json --once

Watch options:
  --config <path>            Worker watch config (posts, poll interval, incident caps)
  --artifact-root-dir <dir>  Root for watch/events and watch/state (default: SCRAPE_ARTIFACT_ROOT_DIR or temp)
  --profile-root-dir <dir>   Chrome profile root (default: SCRAPE_PROFILE_ROOT_DIR)
  --once                     Single poll tick then exit (smoke test)

Environment:
  SCRAPE_CHROME_EXECUTABLE
  SCRAPE_PROFILE_ROOT_DIR
  SCRAPE_LOGIN_AUTO_WAIT_SECS   Non-interactive profile login wait (Docker/noVNC)
  SCRAPE_WAIT_AFTER_NAVIGATION_MS
  SCRAPE_REQUEST_TIMEOUT_SECS
  SCRAPE_SCREEN_VIDEO
  SCRAPE_CONCURRENCY
  SCRAPE_WORKERS
  SCRAPE_WORKER_CONCURRENCY
  SCRAPE_WORKER_START_DELAY_MS
  SCRAPE_MAX_RETRIES
  SCRAPE_ITEM_DELAY_MS
  SCRAPE_ARTIFACT_ROOT_DIR
  SCRAPE_LLM_API_KEY
  SCRAPE_LLM_MODEL

Project structure:
  src/common/   shared runtime helpers
  src/facebook/ facebook target plugin
  src/instagram/ instagram target plugin
  src/watch/     always-on comment watch service
  farm/config/   per-worker watch JSON (copy from worker.example.json)
`;

export { defaultProfileRootDir };
