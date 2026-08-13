import type { Page } from 'playwright';

import { extractInstagramComments } from '../../comments.js';
import { extractInstagramPostDetails } from '../../post-extraction.js';
import { extractInstagramReactions } from '../../reactions.js';
import { extractInstagramShortcode } from '../../shared/url.js';
import type { InstagramScrapeResult } from '../../types.js';
import {
    dismissInstagramOverlays,
    ensureInstagramPostLayout,
    openInstagramCommentsPanel,
} from '../post-screenshot/interactions.js';
import { locateFocusedPostRoot } from '../post-screenshot/evidence.js';

export const POST_ENGAGEMENT_SCRAPER = 'post-engagement';

export const scrapePostEngagement = async (
    page: Page,
    inputUrl: string,
    fallbackFinalUrl: string,
    waitAfterNavigationMs: number,
): Promise<InstagramScrapeResult> => {
    await page.waitForLoadState('domcontentloaded');
    await dismissInstagramOverlays(page);
    const originalPost = await extractInstagramPostDetails(page, fallbackFinalUrl);
    const shortcode = extractInstagramShortcode(fallbackFinalUrl) ?? extractInstagramShortcode(inputUrl);
    await ensureInstagramPostLayout(page, shortcode);
    await page.waitForTimeout(waitAfterNavigationMs);

    const post = await extractInstagramPostDetails(page, fallbackFinalUrl);
    const root = await locateFocusedPostRoot(page, shortcode);
    await openInstagramCommentsPanel(page, root);
    const commentsResult = await extractInstagramComments(page);
    const reactionsResult = await extractInstagramReactions(page);

    return {
        kind: 'engagement',
        inputUrl,
        finalUrl: post.finalUrl,
        scrapedAt: new Date().toISOString(),
        reactionCount: Math.max(originalPost.reactionCount, post.reactionCount, reactionsResult.users.length),
        commentCount: Math.max(originalPost.commentCount, commentsResult.comments.length, post.commentCount),
        commentsComplete: commentsResult.extracted,
        postReactionsComplete: reactionsResult.extracted,
        commentVisibilityComplete: commentsResult.extracted,
        postContent: originalPost.postContent || post.postContent,
        reactions: reactionsResult.users,
        comments: commentsResult.comments,
    };
};
