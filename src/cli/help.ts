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

Direct invocation:
  node dist/main.js [scrape] --target <target> --scraper <scraper> --target-url <url> [--target-url <url> ...] [options]
  node dist/main.js [scrape] profile login --target <target> [options]
  node dist/main.js [scrape] profile path --target <target>

Required for scraping:
  --target <target>          Target platform (${SUPPORTED_TARGETS.join(', ')})
  --scraper <scraper>        Scraper name, e.g. post-engagement
  --target-url <url>         Target resource URL (repeatable)

Options:
  --concurrency <n>          Number of tabs to scrape in parallel (default: 1)
  --screen-video             Force-enable Playwright browser video recording
  --no-screen-video          Disable Playwright browser video recording (default is on)
  --output-file <path>       Also write the final JSON to a file
  --chrome-executable <path> Chrome executable path
  --profile-root-dir <dir>   Root dir for persistent target profiles
  --wait-after-navigation-ms <ms>
                             Extra wait after navigation (default: 5000)
  --request-timeout-secs <s> Navigation timeout (default: 240)
  --verbose                  Print debug logs to stderr
  -h, --help                 Show help
  --version                  Show version

Output:
  - stdout: final JSON
  - stderr: logs and errors
  - JSON file: only when --output-file is set
  - video artifact: written by default unless --no-screen-video is set

Notes:
  - comment-reactions requires a Facebook URL containing ?comment_id=...

Examples:
  scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..."
  scrape --target facebook --scraper comment-reactions --target-url "https://www.facebook.com/...?...&comment_id=123456"
  scrape --target instagram --scraper post-engagement --target-url "https://www.instagram.com/p/..."
  scrape --target instagram --scraper profile-scraper --target-url "https://www.instagram.com/example/"
  scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/a" --target-url "https://www.facebook.com/b" --concurrency 2
  scrape profile login --target facebook
  scrape profile login --target instagram
  scrape profile path --target facebook
  scrape profile path --target instagram

Environment:
  SCRAPE_CHROME_EXECUTABLE
  SCRAPE_PROFILE_ROOT_DIR
  SCRAPE_WAIT_AFTER_NAVIGATION_MS
  SCRAPE_REQUEST_TIMEOUT_SECS
  SCRAPE_SCREEN_VIDEO
  SCRAPE_CONCURRENCY
  SCRAPE_ARTIFACT_ROOT_DIR

Project structure:
  src/common/   shared runtime helpers
  src/facebook/ facebook target plugin
  src/instagram/ instagram target plugin
`;

export { defaultProfileRootDir };
