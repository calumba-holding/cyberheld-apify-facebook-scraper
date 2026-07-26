import { spawn } from "child_process";
import { mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import { PROFILE_ROOT, RUNS_DIR, SCRAPER_DIR } from "./config";
import { setState } from "./pool";
import { setJobStatus } from "./jobs";
import type { Account } from "./pool";

/** Root dir to pass the scraper for this account's persistent profile.
 *  local profile_ref "facebook" -> <PROFILE_ROOT>/facebook (root = PROFILE_ROOT)
 *  profile_ref "worker-1"       -> <PROFILE_ROOT>/worker-1/<target> (root = PROFILE_ROOT/worker-1) */
function profileRootFor(acct: Account): string {
  return acct.profile_ref === acct.platform ? PROFILE_ROOT : join(PROFILE_ROOT, acct.profile_ref);
}

/**
 * Spawn the Node scraper for a job using a leased session, detached.
 * Logs + artifacts land in RUNS_DIR/<job_id>/ so the UI can show progress.
 * On exit: release the session and set the final job status.
 */
export function startScrape(jobId: string, url: string, platform: string, acct: Account) {
  const dir = join(RUNS_DIR, jobId);
  mkdirSync(dir, { recursive: true });
  const log = createWriteStream(join(dir, "run.log"), { flags: "a" });
  log.write(`[admin] job ${jobId} using session ${acct.account_ref} (${acct.profile_ref})\n`);
  log.write(`[admin] target ${url}\n\n`);

  const args = [
    "dist/main.js",
    "--target", platform,
    "--scraper", "post-engagement",
    "--target-url", url,
    "--profile-root-dir", profileRootFor(acct),
    "--artifact-root-dir", dir,
    "--output-file", join(dir, "result.json"),
    "--no-screen-video",
  ];
  const child = spawn("node", args, { cwd: SCRAPER_DIR, detached: true });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.on("close", async (code) => {
    log.write(`\n[admin] scraper exited code=${code}\n`);
    log.end();
    try {
      await setState(acct.id, "active"); // release the session back to the pool
      await setJobStatus(jobId, code === 0 ? "succeeded" : "failed");
    } catch {
      /* best-effort */
    }
  });
  child.unref();
  return { pid: child.pid };
}

/** How long the login window stays open for the user to sign in (auto-save after). */
export const LOGIN_WAIT_SECS = Number(process.env.SCRAPE_LOGIN_AUTO_WAIT_SECS ?? 180);

/**
 * Open Chrome to sign into the platform — NON-interactive so it works from a button:
 * SCRAPE_LOGIN_AUTO_WAIT_SECS keeps Chrome open for N seconds (the user logs in during
 * that window) then the session is saved automatically. Output goes to a log file.
 */
export function startLogin(platform: string, acct: Account) {
  const dir = join(RUNS_DIR, "logins");
  mkdirSync(dir, { recursive: true });
  const log = createWriteStream(join(dir, `${acct.account_ref}.log`), { flags: "a" });
  const args = [
    "dist/main.js",
    "profile", "login",
    "--target", platform,
    "--profile-root-dir", profileRootFor(acct),
  ];
  const child = spawn("node", args, {
    cwd: SCRAPER_DIR,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SCRAPE_LOGIN_AUTO_WAIT_SECS: String(LOGIN_WAIT_SECS) },
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.unref();
  return { pid: child.pid, waitSecs: LOGIN_WAIT_SECS };
}
