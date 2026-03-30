import type { Page } from 'playwright';

import { extractInstagramComments } from '../../comments.js';
import { extractInstagramPostDetails } from '../../post-extraction.js';
import { extractInstagramReactions } from '../../reactions.js';
import type { InstagramScrapeResult } from '../../types.js';

export const POST_ENGAGEMENT_SCRAPER = 'post-engagement';

export const scrapePostEngagement = async (
    page: Page,
    inputUrl: string,
    fallbackFinalUrl: string,
    waitAfterNavigationMs: number,
): Promise<InstagramScrapeResult> => {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    const post = await extractInstagramPostDetails(page, fallbackFinalUrl);
    const commentsResult = await extractInstagramComments(page);
    const reactionsResult = await extractInstagramReactions(page);

    return {
        inputUrl,
        finalUrl: post.finalUrl,
        scrapedAt: new Date().toISOString(),
        reactionCount: Math.max(post.reactionCount, reactionsResult.users.length),
        commentCount: Math.max(commentsResult.comments.length, post.commentCount),
        commentsComplete: commentsResult.extracted,
        postReactionsComplete: reactionsResult.extracted,
        commentVisibilityComplete: commentsResult.extracted,
        postContent: post.postContent,
        reactions: reactionsResult.users,
        comments: commentsResult.comments,
    };
};
