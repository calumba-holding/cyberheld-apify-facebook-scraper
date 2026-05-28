import type { Locator, Page } from 'playwright';

import { captureLocatorScreenshot, captureScreenshot } from '../../../common/screenshot-artifacts.js';
import { log } from '../../../common/logger.js';
import type {
    ReactionUser,
    RunScrapeOptions,
    ScrapedComment,
    ScreenshotArtifact,
    ScreenshotEngagementLabels,
} from '../../../common/types.js';
import { extractInstagramComments } from '../../comments.js';
import { extractInstagramPostDetails, extractVisibleInstagramCounts } from '../../post-extraction.js';
import { COUNT_BUTTON_SELECTOR, DIALOG_SELECTOR, LOAD_MORE_COMMENTS_LABEL } from '../../selectors.js';
import { extractInstagramShortcode } from '../../shared/url.js';
import {
    dismissInstagramOverlays,
    ensureInstagramPostLayout,
    hasCommentsSurface,
    openInstagramCommentsPanel,
} from './interactions.js';

const SURFACE_WAIT_MS = 10_000;
const COMMENT_LOAD_MORE_CLICKS = 30;
const COMMENT_SCROLL_SHOTS = 4;

export const prepareInstagramEvidencePage = async (page: Page, shortcode: string | null): Promise<void> => {
    log.info('Waiting for Instagram post surface...');
    await page.waitForLoadState('domcontentloaded');
    await dismissInstagramOverlays(page);
    await ensureInstagramPostLayout(page, shortcode);

    await page.waitForSelector(
        'article, main, ' + COUNT_BUTTON_SELECTOR.split(',').map((part) => part.trim()).join(', '),
        { state: 'visible', timeout: SURFACE_WAIT_MS },
    ).catch(() => undefined);

    if (shortcode) {
        await page.waitForFunction(
            (code) => window.location.href.includes(code),
            shortcode,
            { timeout: SURFACE_WAIT_MS },
        ).catch(() => undefined);
    }

    log.info(`Instagram post surface ready at ${page.url()}`);
};

export const locateFocusedPostRoot = async (page: Page, shortcode: string | null): Promise<Locator> => {
    if (shortcode) {
        const byShortcode = page.locator('article').filter({
            has: page.locator(`a[href*="/${shortcode}/"]`),
        });
        if (await byShortcode.count() > 0) {
            return byShortcode.first();
        }
    }

    const withVideo = page.locator('article').filter({
        has: page.locator('[aria-label="Video player"], video'),
    });
    if (await withVideo.count() > 0) {
        return withVideo.first();
    }

    const article = page.locator('article').first();
    if (await article.count() > 0) {
        return article;
    }

    return page.locator('main').first();
};

export const readEngagementLabels = async (page: Page): Promise<ScreenshotEngagementLabels> => {
    const fromButtons: ScreenshotEngagementLabels = await page.locator(COUNT_BUTTON_SELECTOR).evaluateAll((nodes) => {
        const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();
        const labels = nodes.map((node) => clean(node.textContent || '')).filter(Boolean);

        const pickMetric = (pattern: RegExp): string | undefined => {
            const match = labels.find((label) => pattern.test(label) && /\d/.test(label));
            if (!match) return undefined;
            return match.match(/^([\d.,]+[KMB]?)/i)?.[1] || match;
        };

        return {
            likes: pickMetric(/likes?$/i),
            comments: pickMetric(/comments?$/i),
            reposts: pickMetric(/reposts?$/i) ?? pickMetric(/shares?$/i),
        };
    }).catch(() => ({}));

    if (fromButtons.likes || fromButtons.comments) {
        return fromButtons;
    }

    const counts = await extractVisibleInstagramCounts(page);
    return {
        likes: counts.reactionCount !== undefined ? String(counts.reactionCount) : undefined,
        comments: counts.commentCount !== undefined ? String(counts.commentCount) : undefined,
    };
};

const resolveCommentsScrollRoot = async (page: Page): Promise<Locator> => {
    const dialog = page.locator(DIALOG_SELECTOR).first();
    if (await dialog.isVisible().catch(() => false)) {
        const dialogList = dialog.locator('ul._a9z6, ul._a9ym').first();
        if (await dialogList.count() > 0) return dialogList;
        return dialog;
    }

    const pageList = page.locator('ul._a9z6, ul._a9ym').first();
    if (await pageList.count() > 0) return pageList;

    return page.locator('main').first();
};

export const expandAndCaptureComments = async (
    page: Page,
    screenshotOptions: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
    startIndex: number,
): Promise<{ screenshots: ScreenshotArtifact[]; commentsExpanded: boolean; comments: ScrapedComment[] }> => {
    if (!(await hasCommentsSurface(page))) {
        log.warning('Comments surface not visible before expansion; skipping comment screenshots.');
        return { screenshots: [], commentsExpanded: false, comments: [] };
    }

    log.info('Expanding Instagram comments (load more / replies)...');
    const expansion = await extractInstagramComments(page, {
        maxPasses: COMMENT_LOAD_MORE_CLICKS,
        clickDelayMs: 450,
        settleMs: 700,
    });

    const scrollRoot = await resolveCommentsScrollRoot(page);
    await scrollRoot.scrollIntoViewIfNeeded().catch(() => undefined);

    const screenshots: ScreenshotArtifact[] = [];
    let labelIndex = startIndex;
    let stableScrolls = 0;
    let previousScrollTop = -1;

    log.info(`Capturing up to ${COMMENT_SCROLL_SHOTS} comment scroll screenshots...`);
    for (let pass = 0; pass < COMMENT_SCROLL_SHOTS && stableScrolls < 2; pass++) {
        screenshots.push(await captureLocatorScreenshot(scrollRoot, {
            ...screenshotOptions,
            label: 'comments',
            variant: 'viewport',
            itemIndex: labelIndex,
        }));
        labelIndex += 1;

        const metrics = await scrollRoot.evaluate((element) => ({
            scrollTop: element.scrollTop,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
        })).catch(() => ({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }));

        const atBottom = metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 4;
        stableScrolls = atBottom ? stableScrolls + 1 : 0;

        if (metrics.scrollTop === previousScrollTop && atBottom) break;
        previousScrollTop = metrics.scrollTop;

        await scrollRoot.evaluate((element) => {
            element.scrollTop += Math.max(200, Math.floor(element.clientHeight * 0.85));
        }).catch(() => undefined);
        await page.waitForTimeout(400);

        const loadMoreVisible = await page.locator('button')
            .filter({ hasText: new RegExp(`^${LOAD_MORE_COMMENTS_LABEL}$`, 'i') })
            .evaluateAll((nodes) => nodes.some((node) => node instanceof HTMLElement && node.offsetParent !== null))
            .catch(() => false);

        if (loadMoreVisible) {
            log.info('Load more comments still visible; running one more expansion pass.');
            await extractInstagramComments(page, { maxPasses: 3, clickDelayMs: 350, settleMs: 500 });
        }
    }

    const dialog = page.locator(DIALOG_SELECTOR).first();
    if (await dialog.isVisible().catch(() => false)) {
        log.info('Capturing comments dialog screenshot...');
        screenshots.push(await captureLocatorScreenshot(dialog, {
            ...screenshotOptions,
            label: 'comments-dialog',
            variant: 'viewport',
            itemIndex: labelIndex,
        }));
    }

    return { screenshots, commentsExpanded: expansion.extracted, comments: expansion.comments };
};

export const captureInstagramPostEvidence = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    options: RunScrapeOptions,
): Promise<{
    screenshots: ScreenshotArtifact[];
    captionPreview?: string;
    engagementLabels?: ScreenshotEngagementLabels;
    commentsExpanded?: boolean;
    reactionCount: number;
    commentCount: number;
    postContent?: string;
    reactions: ReactionUser[];
    comments: ScrapedComment[];
    commentsComplete: boolean;
    postReactionsComplete: boolean;
}> => {
    const shortcode = extractInstagramShortcode(finalUrl) ?? extractInstagramShortcode(inputUrl);
    await prepareInstagramEvidencePage(page, shortcode);

    if (options.waitAfterNavigationMs > 0) {
        log.info(`Waiting ${options.waitAfterNavigationMs}ms after navigation...`);
        await page.waitForTimeout(options.waitAfterNavigationMs);
    }

    log.info('Locating focused Instagram post...');
    const postRoot = await locateFocusedPostRoot(page, shortcode);
    await postRoot.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(500);

    const engagementLabels = await readEngagementLabels(page);
    if (engagementLabels.likes || engagementLabels.comments) {
        log.info(`Engagement visible: likes=${engagementLabels.likes ?? '?'}, comments=${engagementLabels.comments ?? '?'}`);
    }

    const screenshots: ScreenshotArtifact[] = [];
    let itemIndex = options.itemIndex;
    let commentsExpanded: boolean | undefined;
    let comments: ScrapedComment[] = [];
    const shouldExpandComments = options.expandComments !== false;

    if (shouldExpandComments) {
        log.info('Opening Instagram comments panel...');
        const opened = await openInstagramCommentsPanel(page, postRoot);
        commentsExpanded = opened;
        if (!opened) {
            log.warning('Could not open Instagram comments panel; continuing with post screenshots only.');
        }
    }

    log.info('Capturing focused post screenshot...');
    screenshots.push(await captureLocatorScreenshot(postRoot, {
        artifactRootDir: options.artifactRootDir,
        itemIndex,
        outputFile: options.outputFile,
        runId: options.runId,
        label: 'post',
        variant: 'viewport',
    }));
    itemIndex += 1;

    log.info('Capturing viewport screenshot...');
    screenshots.push(await captureScreenshot(page, {
        artifactRootDir: options.artifactRootDir,
        itemIndex,
        outputFile: options.outputFile,
        runId: options.runId,
        label: 'post-view',
        variant: 'viewport',
    }));
    itemIndex += 1;

    if (options.fullPageScreenshot) {
        log.info('Capturing full-page screenshot...');
        screenshots.push(await captureScreenshot(page, {
            artifactRootDir: options.artifactRootDir,
            itemIndex,
            outputFile: options.outputFile,
            runId: options.runId,
            label: 'post',
            variant: 'full',
        }));
        itemIndex += 1;
    }

    if (shouldExpandComments && commentsExpanded) {
        const commentCapture = await expandAndCaptureComments(page, {
            artifactRootDir: options.artifactRootDir,
            itemIndex,
            outputFile: options.outputFile,
            runId: options.runId,
        }, itemIndex);
        screenshots.push(...commentCapture.screenshots);
        commentsExpanded = commentCapture.commentsExpanded;
        comments = commentCapture.comments;
    }

    log.info('Extracting structured engagement data (counts, comments)...');
    const postDetails = await extractInstagramPostDetails(page, page.url());
    // Skip likes-dialog scraping here — opening it can collapse expanded reply threads.
    const reactionsResult = { users: [], extracted: false };

    if (comments.length === 0 && shouldExpandComments) {
        const fallbackComments = await extractInstagramComments(page, { maxPasses: 4, settleMs: 400 });
        comments = fallbackComments.comments;
        commentsExpanded = commentsExpanded ?? fallbackComments.extracted;
    }

    const metaDescription = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => null);
    const captionPreview = postDetails.postContent
        || metaDescription?.trim()
        || (await page.title().catch(() => '')).trim()
        || undefined;

    const reactionCount = Math.max(postDetails.reactionCount, reactionsResult.users.length);
    const commentCount = Math.max(postDetails.commentCount, comments.length, engagementLabels.comments ? 1 : 0);

    log.info(
        `Evidence capture finished: ${screenshots.length} screenshot(s), `
        + `${reactionCount} likes, ${commentCount} comments, ${reactionsResult.users.length} like profiles.`,
    );

    return {
        screenshots,
        captionPreview,
        engagementLabels,
        commentsExpanded,
        reactionCount,
        commentCount,
        postContent: captionPreview,
        reactions: reactionsResult.users,
        comments,
        commentsComplete: commentsExpanded === true || comments.length > 0,
        postReactionsComplete: reactionsResult.extracted,
    };
};
