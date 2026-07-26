import { homedir } from "os";
import { join } from "path";

// The scraper repo root (…/facebook-scraper) — two levels up from platform/admin-ui.
export const SCRAPER_DIR = process.env.SCRAPER_DIR ?? join(process.cwd(), "..", "..");

// Where the persistent Chrome profiles live (scraper default: ~/.scrape/profiles).
export const PROFILE_ROOT =
  process.env.SCRAPE_PROFILE_ROOT_DIR ?? join(homedir(), ".scrape", "profiles");

// Base URL for a session's noVNC live view. Per-session port is appended, e.g.
// http://localhost:6080 -> the UI opens `${NOVNC_BASE}${port}/vnc.html`.
export const NOVNC_BASE = process.env.NOVNC_BASE ?? "http://localhost:";

// Where run logs / artifacts are written so the UI can show "what's being scraped".
export const RUNS_DIR = process.env.RUNS_DIR ?? join(SCRAPER_DIR, "runs");
