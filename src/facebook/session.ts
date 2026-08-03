import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { getProfileDir } from './profile.js';

const execFileAsync = promisify(execFile);

/** Cookies that together indicate a signed-in Facebook session (set on login, cleared on logout). */
const SESSION_COOKIES = ['c_user', 'xs'] as const;

export interface FacebookSessionStatus {
    authenticated: boolean;
    cookiesPresent: string[];
    reason?: string;
}

export interface WorkerSession extends FacebookSessionStatus {
    worker: string;
    profileRootDir: string;
}

const cookiesDbPath = (profileRootDir: string): string =>
    join(getProfileDir(profileRootDir), 'Default', 'Cookies');

/**
 * Read the signed-in signal from a profile's cookie store WITHOUT launching Chrome.
 * A saved, authenticated session has both `c_user` and `xs` for facebook.com, unexpired.
 */
export const readFacebookSessionFromDisk = async (
    profileRootDir: string,
): Promise<FacebookSessionStatus> => {
    const db = cookiesDbPath(profileRootDir);
    if (!existsSync(db)) {
        return { authenticated: false, cookiesPresent: [], reason: 'no cookie store' };
    }
    // Copy first so an in-use (locked) profile can still be inspected.
    const tmp = join(tmpdir(), `fb-cookies-${randomUUID()}.db`);
    try {
        await copyFile(db, tmp);
        const nowChromeEpoch = (Date.now() + 11_644_473_600_000) * 1000; // µs since 1601-01-01
        const query =
            "SELECT name FROM cookies WHERE name IN ('c_user','xs') "
            + "AND host_key LIKE '%facebook.com' "
            + `AND (expires_utc = 0 OR expires_utc > ${String(nowChromeEpoch)});`;
        const { stdout } = await execFileAsync('sqlite3', [tmp, query], { timeout: 5_000 });
        const present = [...new Set(stdout.split('\n').map((line) => line.trim()).filter(Boolean))];
        const authenticated = SESSION_COOKIES.every((cookie) => present.includes(cookie));
        return {
            authenticated,
            cookiesPresent: present,
            reason: authenticated ? undefined : 'session cookie missing or expired',
        };
    } catch (error) {
        return {
            authenticated: false,
            cookiesPresent: [],
            reason: error instanceof Error ? error.message : String(error),
        };
    } finally {
        await rm(tmp, { force: true }).catch(() => undefined);
    }
};

/** Enumerate `worker-*` profiles under a profiles root, with each one's auth status. */
export const listWorkerSessions = async (profilesRoot: string): Promise<WorkerSession[]> => {
    const entries = await readdir(profilesRoot, { withFileTypes: true }).catch(() => []);
    const workers = entries
        .filter((entry) => entry.isDirectory() && /^worker-\d+$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));

    const sessions: WorkerSession[] = [];
    for (const worker of workers) {
        const profileRootDir = join(profilesRoot, worker);
        const status = await readFacebookSessionFromDisk(profileRootDir);
        sessions.push({ worker, profileRootDir, ...status });
    }
    return sessions;
};

/** Thrown when a fire is attempted without a saved, authenticated session. Never scrape past this. */
export class NeedsAuthenticationError extends Error {
    readonly sessions: WorkerSession[];
    constructor(message: string, sessions: WorkerSession[]) {
        super(message);
        this.name = 'NeedsAuthenticationError';
        this.sessions = sessions;
    }
}

export interface ResolveSessionOptions {
    profilesRoot: string;
    /** Specific worker ("worker-2" or "2"). Omit to take the first authenticated session. */
    worker?: string;
}

/**
 * THE GATE. Return an authenticated worker session, or throw NeedsAuthenticationError.
 * Every scrape action must pass through this before any Chrome is launched.
 */
export const resolveAuthenticatedWorker = async (
    options: ResolveSessionOptions,
): Promise<WorkerSession> => {
    const sessions = await listWorkerSessions(options.profilesRoot);
    if (sessions.length === 0) {
        throw new NeedsAuthenticationError('No worker profiles found — authenticate at least one session first.', []);
    }

    if (options.worker) {
        const wanted = options.worker.startsWith('worker-') ? options.worker : `worker-${options.worker}`;
        const chosen = sessions.find((session) => session.worker === wanted);
        if (!chosen) {
            throw new NeedsAuthenticationError(`Requested ${wanted} not found.`, sessions);
        }
        if (!chosen.authenticated) {
            throw new NeedsAuthenticationError(`${wanted} is not signed in — authenticate it first, then retry.`, sessions);
        }
        return chosen;
    }

    const firstAuthenticated = sessions.find((session) => session.authenticated);
    if (!firstAuthenticated) {
        throw new NeedsAuthenticationError('No authenticated session available — sign in at least one worker first.', sessions);
    }
    return firstAuthenticated;
};

/** Live guard: read cookies from an already-open context; throw if not signed in. */
export const assertFacebookAuthenticatedContext = async (
    context: { cookies: (url?: string) => Promise<{ name: string }[]> },
): Promise<void> => {
    const cookies = await context.cookies('https://www.facebook.com');
    const names = new Set(cookies.map((cookie) => cookie.name));
    const missing = SESSION_COOKIES.filter((cookie) => !names.has(cookie));
    if (missing.length > 0) {
        throw new NeedsAuthenticationError(`Session not signed in (missing: ${missing.join(', ')}).`, []);
    }
};
