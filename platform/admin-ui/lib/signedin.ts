import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { PROFILE_ROOT, SCRAPER_DIR } from "./config";
import type { Account } from "./pool";

// A logged-in Facebook profile has a `c_user` session cookie. The cookie *value* is
// encrypted, but the cookie name is stored as plaintext in Chrome's Cookies SQLite —
// so a cheap, dependency-free signal is: the Cookies file contains the bytes "c_user".
const MARKERS: Record<string, string> = {
  facebook: "c_user",
  instagram: "sessionid",
  tiktok: "sessionid",
};

/** Candidate Chrome user-data dirs for an account (local + Docker worker copies). */
function candidateDirs(a: Account): string[] {
  const dirs: string[] = [];
  // local: <PROFILE_ROOT>/<platform>  (profile_ref === platform)  or  <PROFILE_ROOT>/<profile_ref>/<platform>
  const root = a.profile_ref === a.platform ? PROFILE_ROOT : join(PROFILE_ROOT, a.profile_ref);
  dirs.push(join(root, a.platform));
  // Dockerized worker sessions live under the repo's docker/profiles/<worker>/<platform>
  const m = a.profile_ref.match(/worker-\d+/);
  if (m) dirs.push(join(SCRAPER_DIR, "docker", "profiles", m[0], a.platform));
  return dirs;
}

/** Cookie DB locations Chrome uses across versions. */
function cookieFiles(dir: string): string[] {
  return [
    join(dir, "Default", "Network", "Cookies"),
    join(dir, "Default", "Cookies"),
    join(dir, "Cookies"),
  ];
}

export function isSignedIn(a: Account): { signed_in: boolean; where: string | null } {
  const marker = MARKERS[a.platform] ?? "c_user";
  for (const dir of candidateDirs(a)) {
    for (const f of cookieFiles(dir)) {
      try {
        if (!existsSync(f) || statSync(f).size < 100) continue;
        const buf = readFileSync(f);
        if (buf.includes(Buffer.from(marker))) return { signed_in: true, where: dir };
      } catch {
        /* unreadable -> treat as not found */
      }
    }
  }
  return { signed_in: false, where: null };
}
