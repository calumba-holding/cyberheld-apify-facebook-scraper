#!/usr/bin/env node
/**
 * Standalone entry for the Facebook PROFILE scraper type (profile + latest N posts).
 *
 * Kept separate from the post-oriented run flow: the two scraper *types* — post
 * (comments/replies/reactions) and profile (profile + latest posts) — are different
 * shapes, so profile gets its own entry rather than being forced through the
 * post-URL machinery. The entrypoint's `profile <url>` command runs this.
 *
 * Usage: node dist/facebook/scrapers/profile/run.js <profileUrl>
 * Env:   SCRAPE_PROFILE_ROOT_DIR, SCRAPE_CHROME_EXECUTABLE, SCRAPE_MAX_POSTS (default 20)
 */

import { defaultChromeExecutable } from '../../../cli/help.js';
import { NeedsAuthenticationError } from '../../session.js';
import { runFacebookProfileScrape, selectLatestPosts } from './index.js';

const main = async (): Promise<void> => {
    const profileUrl = process.argv[2];
    if (!profileUrl) {
        process.stderr.write('usage: profile <profileUrl>\n');
        process.exitCode = 2;
        return;
    }

    const profileRootDir = process.env.SCRAPE_PROFILE_ROOT_DIR ?? 'docker/profiles/worker-1';
    const chromeExecutable = process.env.SCRAPE_CHROME_EXECUTABLE ?? defaultChromeExecutable;
    const maxPostsRaw = Number(process.env.SCRAPE_MAX_POSTS ?? '20');
    const maxPosts = Number.isFinite(maxPostsRaw) && maxPostsRaw > 0 ? Math.floor(maxPostsRaw) : 20;

    try {
        const result = await runFacebookProfileScrape(profileUrl, { profileRootDir, chromeExecutable, maxPosts });
        const posts = selectLatestPosts(result);
        process.stdout.write(JSON.stringify({
            kind: 'profile',
            profileUrl: result.profileUrl,
            header: result.header,
            latestPostsCount: posts.length,
            latestPosts: posts,
            tabs: Object.keys(result.tabs),
            errors: result.errors,
        }, null, 2) + '\n');
    } catch (error) {
        if (error instanceof NeedsAuthenticationError) {
            process.stderr.write(`NEEDS_AUTHENTICATION: ${error.message}\n`);
            process.exitCode = 3;
            return;
        }
        process.stderr.write(`profile scrape failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
};

await main();
