import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { BrowserContext } from 'playwright';

import { launchPersistentChromeContext } from '../../../common/persistent-browser.js';
import { getProfileDir } from '../../profile.js';
import {
    NeedsAuthenticationError,
    assertFacebookAuthenticatedContext,
    readFacebookSessionFromDisk,
} from '../../session.js';
import { scrapeFacebookProfile } from './profile-scraper.js';
import type { ProfilePost, ProfileScrapeResult } from './types.js';

/**
 * The Facebook "profile" scraper type — the counterpart to `post-engagement`.
 * It scrapes a user's profile (header + overview + tabs) and their latest N posts.
 * Ported from the standalone facebook-cli so both scraper types live side by side
 * under this repo's `src/facebook/scrapers/`.
 */
export const FACEBOOK_PROFILE_SCRAPER = 'profile-scraper';

const SINGLETON_LOCKS = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'] as const;

export interface FacebookProfileRunOptions {
    profileRootDir: string;
    chromeExecutable: string;
    navigationTimeoutMs?: number;
    waitAfterNavigationMs?: number;
    /** How many recent posts to capture from the profile's feed (default 20). */
    maxPosts?: number;
}

/** Remove stale Chrome singleton locks so the persistent profile can be opened. */
const clearProfileLocks = async (profileDir: string): Promise<void> => {
    await Promise.all(
        SINGLETON_LOCKS.map((name) => unlink(join(profileDir, name)).catch(() => undefined)),
    );
};

/** Launch the signed-in Facebook profile and scrape the profile + latest N posts. */
export const runFacebookProfileScrape = async (
    profileUrl: string,
    options: FacebookProfileRunOptions,
): Promise<ProfileScrapeResult> => {
    // GATE: never scrape without a saved, authenticated session (disk pre-check, no Chrome).
    const diskSession = await readFacebookSessionFromDisk(options.profileRootDir);
    if (!diskSession.authenticated) {
        throw new NeedsAuthenticationError(
            `Refusing to scrape: this session is not signed in (${diskSession.reason ?? 'no session cookie'}). `
            + 'Authenticate it first, then retry.',
            [],
        );
    }

    const profileDir = getProfileDir(options.profileRootDir);
    await clearProfileLocks(profileDir);

    const context: BrowserContext = await launchPersistentChromeContext({
        profileDir,
        executablePath: options.chromeExecutable,
    });
    try {
        // Live guard: confirm the launched session really carries the login cookies.
        await assertFacebookAuthenticatedContext(context);
        const page = context.pages().find((candidate) => !candidate.isClosed()) ?? await context.newPage();
        return await scrapeFacebookProfile(page, profileUrl, {
            navigationTimeoutMs: options.navigationTimeoutMs ?? 60_000,
            waitAfterNavigationMs: options.waitAfterNavigationMs ?? 4_000,
            maxPosts: options.maxPosts ?? 20,
        });
    } finally {
        await context.close().catch(() => undefined);
    }
};

/** Pull the latest posts out of whichever tab captured the posts feed. */
export const selectLatestPosts = (result: ProfileScrapeResult): ProfilePost[] => {
    for (const tab of Object.values(result.tabs)) {
        if (tab.posts && tab.posts.length > 0) return tab.posts;
    }
    return [];
};

export { scrapeFacebookProfile };
export type { ProfilePost, ProfileScrapeResult };
