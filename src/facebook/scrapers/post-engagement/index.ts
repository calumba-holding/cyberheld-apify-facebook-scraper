import { log } from '../../../common/logger.js';
import type { BrowserSessionMode } from '../../../common/types.js';
import { switchToAllComments } from '../../comment-filter.js';
import { extractAllComments } from '../../comments.js';
import { extractPostContent } from '../../post-extraction.js';
import { extractAllReactions } from '../../reactions.js';
import { resolvePostScope } from '../../shared/post-scope.js';
import { startFacebookSourceVideoDownload } from '../../shared/source-video.js';
import { isEquivalentFacebookTargetUrl, isFacebookVideoUrl } from '../../shared/url.js';
import { buildCommentKey, type FacebookScrapeResult } from '../../types.js';
import { tryExtractPublicPostEngagementFromApiPayload } from './public-post-api.js';
import { extractVisiblePublicCommentsFromRelayStore } from './public-post-relay-comments.js';
import { tryExtractPublicVideoPostEngagement } from './public-video-api.js';
import type { Page } from 'playwright';

interface PostEngagementScrapeOptions {
    artifactRootDir: string;
    browserSessionMode: BrowserSessionMode;
    download: boolean;
    itemIndex: number;
    outputFile?: string;
    profileDir: string;
    publicPostApiPayload?: string;
    runId: string;
}

const mergeScrapedComments = (...collections: FacebookScrapeResult['comments'][]): FacebookScrapeResult['comments'] => {
    const seen = new Set<string>();
    const merged = [] as FacebookScrapeResult['comments'];
    for (const comments of collections) {
        for (const comment of comments) {
            const key = buildCommentKey(comment);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(comment);
        }
    }
    return merged;
};

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
        if (options.publicPostApiPayload) {
            log.info('Trying public Facebook API payload extraction before DOM scraping.');
            const apiResult = tryExtractPublicPostEngagementFromApiPayload(options.publicPostApiPayload, inputUrl, finalUrl);
            if (apiResult) {
                log.info(`Using public Facebook API payload result with ${apiResult.comments.length} comments.`);
                const sourceVideo = sourceVideoDownload ? await sourceVideoDownload.promise : undefined;
                return sourceVideo ? { ...apiResult, sourceVideo } : apiResult;
            }
        }

        if (options.browserSessionMode === 'public-session' && isFacebookVideoUrl(finalUrl)) {
            log.info('Trying public Facebook video API extraction before DOM scraping.');
            const apiResult = await tryExtractPublicVideoPostEngagement(page, inputUrl, finalUrl);
            if (apiResult) {
                log.info(`Using public Facebook video API result with ${apiResult.comments.length} comments.`);
                const sourceVideo = sourceVideoDownload ? await sourceVideoDownload.promise : undefined;
                return sourceVideo ? { ...apiResult, sourceVideo } : apiResult;
            }
        }

        const scope = await resolvePostScope(page, finalUrl);
        const postContent = await extractPostContent(scope);

        log.info(`Page URL before comment scrape: ${page.url()}`);
        const initialComments = await extractAllComments(page, scope);
        const commentFilter = await switchToAllComments(page, scope);
        const domComments = commentFilter.shouldReloadComments
            ? await extractAllComments(page, scope)
            : initialComments;
        const relayComments = options.browserSessionMode === 'public-session' && isFacebookVideoUrl(finalUrl)
            ? await extractVisiblePublicCommentsFromRelayStore(page)
            : [];
        const comments = mergeScrapedComments(domComments, relayComments);
        if (relayComments.length > 0 && comments.length > domComments.length) {
            log.info(`Merged ${String(relayComments.length)} visible public Relay comments into the post result.`);
        }

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
