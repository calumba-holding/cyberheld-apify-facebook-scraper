import { log } from '../../../common/logger.js';
import type { BrowserSessionMode } from '../../../common/types.js';
import { switchToAllComments } from '../../comment-filter.js';
import { extractAllComments } from '../../comments.js';
import { extractPostContent } from '../../post-extraction.js';
import { extractAllReactions } from '../../reactions.js';
import { resolvePostScope } from '../../shared/post-scope.js';
import { startFacebookSourceVideoDownload } from '../../shared/source-video.js';
import { isEquivalentFacebookTargetUrl } from '../../shared/url.js';
import type { FacebookScrapeResult } from '../../types.js';
import type { Page } from 'playwright';

interface PostEngagementScrapeOptions {
    artifactRootDir: string;
    browserSessionMode: BrowserSessionMode;
    download: boolean;
    itemIndex: number;
    outputFile?: string;
    profileDir: string;
    runId: string;
}

export const POST_ENGAGEMENT_SCRAPER = 'post-engagement';

export const scrapePostEngagement = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    waitAfterNavigationMs: number,
    options: PostEngagementScrapeOptions,
): Promise<FacebookScrapeResult> => {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    const sourceVideoDownload = options.download
        ? await startFacebookSourceVideoDownload(finalUrl, options.profileDir, options.browserSessionMode, options)
        : null;

    try {
        const scope = await resolvePostScope(page, finalUrl);
        const postContent = await extractPostContent(scope);

        log.info(`Page URL before comment scrape: ${page.url()}`);
        const initialComments = await extractAllComments(page, scope);
        const commentFilter = await switchToAllComments(page, scope);
        const comments = commentFilter.shouldReloadComments
            ? await extractAllComments(page, scope)
            : initialComments;

        if (!isEquivalentFacebookTargetUrl(finalUrl, page.url())) {
            log.warning(`Facebook drifted away from the target during comment extraction. Reloading target before reaction scrape: ${page.url()}`);
            await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(Math.min(waitAfterNavigationMs, 5000));
        }

        const reactionScope = await resolvePostScope(page, finalUrl);
        log.info(`Page URL before reaction scrape: ${page.url()}`);
        const reactionResult = await extractAllReactions(page, reactionScope);
        const sourceVideo = sourceVideoDownload ? await sourceVideoDownload.promise : undefined;

        return {
            kind: 'engagement',
            inputUrl,
            finalUrl,
            scrapedAt: new Date().toISOString(),
            reactionCount: reactionResult.visibleTotal ?? reactionResult.users.length,
            commentCount: comments.length,
            commentsComplete: true,
            postReactionsComplete: reactionResult.extracted,
            commentVisibilityComplete: commentFilter.applied,
            postContent,
            reactions: reactionResult.users,
            comments,
            sourceVideo,
        };
    } catch (error) {
        await sourceVideoDownload?.cancel();
        throw error;
    }
};
