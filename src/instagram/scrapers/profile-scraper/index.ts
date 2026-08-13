import type { Page } from 'playwright';

import type { ProfileScrapeResult, ScreenshotArtifact } from '../../../common/types.js';
import type { RunScrapeOptions } from '../../../common/types.js';
import { extractInstagramProfileData } from './extraction.js';
import { collectInstagramProfilePosts } from './posts.js';
import { captureInstagramProfileScreenshot } from './screenshot.js';

export const PROFILE_SCRAPER = 'profile-scraper';

const hasUsefulProfileData = (result: ProfileScrapeResult['profile']): boolean => {
    return Boolean(
        result.username
        || result.displayName
        || result.bio
        || result.profilePictureUrl
        || result.externalLinks.length
        || result.counts.posts !== undefined
        || result.counts.followers !== undefined
        || result.counts.following !== undefined,
    );
};

export const scrapeProfile = async (
    page: Page,
    inputUrl: string,
    fallbackFinalUrl: string,
    options: RunScrapeOptions,
): Promise<ProfileScrapeResult> => {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(options.waitAfterNavigationMs);

    const profile = await extractInstagramProfileData(page, fallbackFinalUrl);
    if (!hasUsefulProfileData(profile)) {
        throw new Error('Could not extract usable Instagram profile data.');
    }

    const screenshots: ScreenshotArtifact[] = [];
    const screenshot = await captureInstagramProfileScreenshot(page, options).catch(() => undefined);
    if (screenshot) screenshots.push(screenshot);
    const requestedPostCount = options.maxPosts ?? 20;
    const errors: string[] = [];
    const collection = profile.indicators.private
        ? { posts: [], discoveredLinks: 0, sampleHrefs: [] }
        : await collectInstagramProfilePosts(page, requestedPostCount).catch((error: unknown) => {
            errors.push(error instanceof Error ? error.message : String(error));
            return { posts: [], discoveredLinks: 0, sampleHrefs: [] };
        });
    if (!profile.indicators.private && collection.posts.length === 0) {
        errors.push(
            `Instagram exposed no post/reel links after scrolling (inspected ${collection.discoveredLinks} visible links).`
            + (collection.sampleHrefs.length ? ` Samples: ${collection.sampleHrefs.join(', ')}` : ''),
        );
    }

    return {
        kind: 'profile',
        inputUrl,
        finalUrl: profile.url,
        scrapedAt: new Date().toISOString(),
        profile: {
            ...profile,
            recentPosts: collection.posts,
            requestedPostCount,
            extractedPostCount: collection.posts.length,
            errors,
        },
        screenshots,
        status: 'SUCCEEDED',
    };
};
