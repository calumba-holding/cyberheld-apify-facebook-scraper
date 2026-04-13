import { log } from '../../../common/logger.js';
import type { BrowserSessionMode } from '../../../common/types.js';
import { enrichCommentTimestamps } from '../../comment-timestamps.js';
import { extractReactionsForComment } from '../../comment-reactions.js';
import { findTargetCommentById } from '../../shared/comment-target.js';
import { getCommentLocators } from '../../shared/comments-ui.js';
import { resolvePostScope } from '../../shared/post-scope.js';
import { extractCommentIdFromFacebookUrl } from '../../shared/url.js';
import type { FacebookScrapeResult } from '../../types.js';
import { tryExtractPublicCommentReactionsFromApi } from './public-comment-api.js';
import type { GraphqlRequestTemplate } from '../post-engagement/public-post-api-graphql.js';
import type { Page } from 'playwright';

export const COMMENT_REACTIONS_SCRAPER = 'comment-reactions';

export const scrapeCommentReactions = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    waitAfterNavigationMs: number,
    options: {
        browserSessionMode: BrowserSessionMode;
        publicGraphqlTemplate?: GraphqlRequestTemplate;
    },
): Promise<FacebookScrapeResult> => {
    const targetCommentId = extractCommentIdFromFacebookUrl(finalUrl) ?? extractCommentIdFromFacebookUrl(inputUrl);
    if (!targetCommentId) {
        throw new Error('comment-reactions requires a Facebook target URL with ?comment_id=...');
    }

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    if (options.browserSessionMode === 'public-session') {
        log.info(`Trying public Facebook API extraction for target comment ${targetCommentId}.`);
        const publicResult = await tryExtractPublicCommentReactionsFromApi(page, targetCommentId, options.publicGraphqlTemplate);
        if (publicResult) {
            log.info(`Using public Facebook API result for target comment ${targetCommentId} with ${String(publicResult.comment.reactions?.users.length ?? 0)} reaction users.`);
            return {
                kind: 'engagement',
                inputUrl,
                finalUrl,
                scrapedAt: new Date().toISOString(),
                reactionCount: 0,
                commentCount: 1,
                commentsComplete: true,
                postReactionsComplete: false,
                commentVisibilityComplete: false,
                reactions: [],
                comments: [publicResult.comment],
                status: publicResult.complete ? 'SUCCEEDED' : 'PARTIAL',
            };
        }
    }

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
        kind: 'engagement',
        inputUrl,
        finalUrl,
        scrapedAt: new Date().toISOString(),
        reactionCount: 0,
        commentCount: 1,
        commentsComplete: true,
        postReactionsComplete: false,
        commentVisibilityComplete: false,
        reactions: [],
        comments: [match.record],
        status: 'SUCCEEDED',
    };
};
