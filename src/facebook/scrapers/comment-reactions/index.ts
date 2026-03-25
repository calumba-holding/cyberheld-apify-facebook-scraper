import { log } from '../../../common/logger.js';
import { enrichCommentTimestamps } from '../../comment-timestamps.js';
import { extractReactionsForComment } from '../../comment-reactions.js';
import { findTargetCommentById } from '../../shared/comment-target.js';
import { getCommentLocators } from '../../shared/comments-ui.js';
import { resolvePostScope } from '../../shared/post-scope.js';
import { extractCommentIdFromFacebookUrl } from '../../shared/url.js';
import type { FacebookScrapeResult } from '../../types.js';
import type { Page } from 'playwright';

export const COMMENT_REACTIONS_SCRAPER = 'comment-reactions';

export const scrapeCommentReactions = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    waitAfterNavigationMs: number,
): Promise<FacebookScrapeResult> => {
    const targetCommentId = extractCommentIdFromFacebookUrl(finalUrl) ?? extractCommentIdFromFacebookUrl(inputUrl);
    if (!targetCommentId) {
        throw new Error('comment-reactions requires a Facebook target URL with ?comment_id=...');
    }

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    const scope = await resolvePostScope(page, finalUrl);
    const match = await findTargetCommentById(page, scope, targetCommentId);
    if (!match) {
        throw new Error(`Target comment not found for comment_id=${targetCommentId}`);
    }

    await enrichCommentTimestamps(page, getCommentLocators(scope), [match.record]);
    log.info(`Opening reactions only for target comment ${targetCommentId}.`);
    const reactions = await extractReactionsForComment(page, match.locator, match.record);
    if (reactions) match.record.reactions = reactions;

    return {
        inputUrl,
        finalUrl,
        scrapedAt: new Date().toISOString(),
        reactionCount: 0,
        commentCount: 1,
        allCommentsFilterApplied: false,
        reactions: [],
        comments: [match.record],
        status: 'SUCCEEDED',
    };
};
