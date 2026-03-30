import { log } from '../../../common/logger.js';
import { switchToAllComments } from '../../comment-filter.js';
import { extractAllComments } from '../../comments.js';
import { extractPostContent } from '../../post-extraction.js';
import { extractAllReactions } from '../../reactions.js';
import { resolvePostScope } from '../../shared/post-scope.js';
import type { FacebookScrapeResult } from '../../types.js';
import type { Page } from 'playwright';

export const POST_ENGAGEMENT_SCRAPER = 'post-engagement';

export const scrapePostEngagement = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    waitAfterNavigationMs: number,
): Promise<FacebookScrapeResult> => {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    const scope = await resolvePostScope(page, finalUrl);
    const postContent = await extractPostContent(scope);

    log.info(`Page URL before comment scrape: ${page.url()}`);
    const initialComments = await extractAllComments(page, scope);
    const commentFilter = await switchToAllComments(page, scope);
    const comments = commentFilter.shouldReloadComments
        ? await extractAllComments(page, scope)
        : initialComments;

    log.info(`Page URL before reaction scrape: ${page.url()}`);
    const reactionResult = await extractAllReactions(page, scope);

    return {
        kind: 'engagement',
        inputUrl,
        finalUrl,
        scrapedAt: new Date().toISOString(),
        reactionCount: reactionResult.users.length,
        commentCount: comments.length,
        commentsComplete: true,
        postReactionsComplete: reactionResult.extracted,
        commentVisibilityComplete: commentFilter.applied,
        postContent,
        reactions: reactionResult.users,
        comments,
    };
};
