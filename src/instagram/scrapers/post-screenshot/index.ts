import type { Page } from 'playwright';

import { writeEngagementJsonFile } from '../../../common/engagement-export.js';
import type { RunScrapeOptions, ScreenshotScrapeResult } from '../../../common/types.js';
import { captureInstagramPostEvidence } from './evidence.js';

export const POST_SCREENSHOT_SCRAPER = 'post-screenshot';

export const scrapePostScreenshot = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    options: RunScrapeOptions,
): Promise<ScreenshotScrapeResult> => {
    const evidence = await captureInstagramPostEvidence(page, inputUrl, finalUrl, options);
    const scrapedAt = new Date().toISOString();

    const engagementJsonPath = await writeEngagementJsonFile(options, {
        inputUrl,
        finalUrl: page.url(),
        scrapedAt,
        engagement: {
            labels: evidence.engagementLabels,
            reactionCount: evidence.reactionCount,
            commentCount: evidence.commentCount,
        },
        post: { content: evidence.postContent },
        reactions: evidence.reactions,
        comments: evidence.comments,
        replies: evidence.comments.filter((comment) => comment.parentId),
        topLevelComments: evidence.comments.filter((comment) => !comment.parentId),
        completeness: {
            commentsExtracted: evidence.commentsComplete,
            postReactionsExtracted: evidence.postReactionsComplete,
            commentsExpanded: evidence.commentsExpanded,
        },
    });

    return {
        kind: 'screenshot',
        inputUrl,
        finalUrl: page.url(),
        scrapedAt,
        screenshots: evidence.screenshots,
        status: evidence.screenshots.length > 0 ? 'SUCCEEDED' : 'PARTIAL',
        captionPreview: evidence.captionPreview,
        engagementLabels: evidence.engagementLabels,
        commentsExpanded: evidence.commentsExpanded,
        reactionCount: evidence.reactionCount,
        commentCount: evidence.commentCount,
        postContent: evidence.postContent,
        reactions: evidence.reactions,
        comments: evidence.comments,
        commentsComplete: evidence.commentsComplete,
        postReactionsComplete: evidence.postReactionsComplete,
        engagementJsonPath,
    };
};
