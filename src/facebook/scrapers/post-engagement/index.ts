import { log } from '../../../common/logger.js';
import type { BrowserSessionMode, EngagementScrapeResult, ScrapedComment, SelfHealingArtifact } from '../../../common/types.js';
import { switchToAllComments } from '../../comment-filter.js';
import { extractAllComments } from '../../comments.js';
import { extractPostContent } from '../../post-extraction.js';
import { extractAllReactions } from '../../reactions.js';
import { resolvePostScope } from '../../shared/post-scope.js';
import { startFacebookSourceVideoDownload } from '../../shared/source-video.js';
import { isEquivalentFacebookTargetUrl, isFacebookVideoUrl } from '../../shared/url.js';
import { buildCommentKey } from '../../types.js';
import {
    tryGenerateAndSavePostEngagementScript,
    trySavedPostEngagementScript,
} from './self-healing-fast-path.js';
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
    regenerateScript: boolean;
    runId: string;
    /** Skip reaction modal scrape (watch polls). */
    commentsOnly?: boolean;
}

const mergeScrapedComments = (...collections: ScrapedComment[][]): ScrapedComment[] => {
    const seen = new Set<string>();
    const merged: ScrapedComment[] = [];
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

const withSelfHealingArtifacts = (
    result: EngagementScrapeResult,
    artifacts: SelfHealingArtifact[],
): EngagementScrapeResult => (
    artifacts.length > 0 ? { ...result, selfHealing: artifacts } : result
);

export const POST_ENGAGEMENT_SCRAPER = 'post-engagement';

export const scrapePostEngagement = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    waitAfterNavigationMs: number,
    options: PostEngagementScrapeOptions,
): Promise<EngagementScrapeResult> => {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    const sourceVideoDownload = options.download
        ? await startFacebookSourceVideoDownload(finalUrl, options.profileDir, options.browserSessionMode, options)
        : null;
    const selfHealingArtifacts: SelfHealingArtifact[] = [];

    try {
        if (options.publicPostApiPayload) {
            log.info('Trying public Facebook API payload extraction before DOM scraping.');
            const apiResult = tryExtractPublicPostEngagementFromApiPayload(options.publicPostApiPayload, inputUrl, finalUrl);
            if (apiResult) {
                log.info(`Using public Facebook API payload result with ${apiResult.comments.length} comments.`);
                const sourceVideo = sourceVideoDownload ? await sourceVideoDownload.promise : undefined;
                await tryGenerateAndSavePostEngagementScript(
                    page,
                    POST_ENGAGEMENT_SCRAPER,
                    options,
                    selfHealingArtifacts,
                );
                return withSelfHealingArtifacts(sourceVideo ? { ...apiResult, sourceVideo } : apiResult, selfHealingArtifacts);
            }
        }

        if (options.browserSessionMode === 'public-session' && isFacebookVideoUrl(finalUrl)) {
            log.info('Trying public Facebook video API extraction before DOM scraping.');
            const apiResult = await tryExtractPublicVideoPostEngagement(page, inputUrl, finalUrl);
            if (apiResult) {
                log.info(`Using public Facebook video API result with ${apiResult.comments.length} comments.`);
                const sourceVideo = sourceVideoDownload ? await sourceVideoDownload.promise : undefined;
                await tryGenerateAndSavePostEngagementScript(
                    page,
                    POST_ENGAGEMENT_SCRAPER,
                    options,
                    selfHealingArtifacts,
                );
                return withSelfHealingArtifacts(sourceVideo ? { ...apiResult, sourceVideo } : apiResult, selfHealingArtifacts);
            }
        }

        // Path A: run saved script if available and not forcing regeneration
        if (!options.regenerateScript) {
            const sourceVideo = sourceVideoDownload ? await sourceVideoDownload.promise : undefined;
            const savedResult = await trySavedPostEngagementScript(
                page,
                POST_ENGAGEMENT_SCRAPER,
                inputUrl,
                finalUrl,
                sourceVideo,
                options,
                selfHealingArtifacts,
                options.commentsOnly,
            );
            if (savedResult) return savedResult;
        }

        // Path B: standard DOM extraction
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

        const sourceVideo = sourceVideoDownload ? await sourceVideoDownload.promise : undefined;

        if (options.commentsOnly) {
            log.info(`Skipping post-reaction scrape (comments-only watch poll). Extracted ${String(comments.length)} comments.`);
            return withSelfHealingArtifacts({
                kind: 'engagement',
                inputUrl,
                finalUrl,
                scrapedAt: new Date().toISOString(),
                reactionCount: 0,
                commentCount: comments.length,
                commentsComplete: true,
                postReactionsComplete: false,
                commentVisibilityComplete: commentFilter.applied,
                postContent,
                reactions: [],
                comments,
                sourceVideo,
            }, selfHealingArtifacts);
        }

        if (!isEquivalentFacebookTargetUrl(finalUrl, page.url())) {
            log.warning(`Facebook drifted away from the target during comment extraction. Reloading target before reaction scrape: ${page.url()}`);
            await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(Math.min(waitAfterNavigationMs, 5000));
        }

        const reactionScope = await resolvePostScope(page, finalUrl);
        log.info(`Page URL before reaction scrape: ${page.url()}`);
        const reactionResult = await extractAllReactions(page, reactionScope);

        await tryGenerateAndSavePostEngagementScript(
            page,
            POST_ENGAGEMENT_SCRAPER,
            options,
            selfHealingArtifacts,
        );

        return withSelfHealingArtifacts({
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
        }, selfHealingArtifacts);
    } catch (error) {
        await sourceVideoDownload?.cancel();
        throw error;
    }
};
