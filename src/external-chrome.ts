import { log } from 'apify';
import { chromium, type BrowserContext, type Page, type Video } from 'playwright';

import type { ScrapedComment } from './comment-models.js';
import { switchToAllComments } from './comment-filter.js';
import type { FacebookScraperInput } from './input.js';
import { extractAllReactions, type ReactionUser } from './reactions.js';
import { extractAllComments } from './comments.js';

export type ScrapeResult = {
    inputUrl: string;
    finalUrl: string;
    scrapedAt: string;
    reactionCount: number;
    commentCount: number;
    allCommentsFilterApplied: boolean;
    reactions: ReactionUser[];
    comments: ScrapedComment[];
    videoPath?: string;
};

const sanitizeFacebookPostUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        parsed.searchParams.delete('rdid');
        parsed.searchParams.delete('share_url');
        return parsed.toString();
    } catch {
        return url;
    }
};

const resolveFacebookPostUrl = async (url: string): Promise<string> => {
    let current = url;
    for (let redirect = 0; redirect < 5; redirect++) {
        try {
            const response = await fetch(current, { method: 'HEAD', redirect: 'manual' });
            if (response.status < 300 || response.status >= 400) return sanitizeFacebookPostUrl(current);

            const location = response.headers.get('location');
            if (!location) return sanitizeFacebookPostUrl(current);
            current = new URL(location, current).toString();
        } catch {
            return sanitizeFacebookPostUrl(current);
        }
    }

    return sanitizeFacebookPostUrl(current);
};

const scrapeLoadedPage = async (
    page: Page,
    inputUrl: string,
    waitAfterNavigationMs: number,
): Promise<Omit<ScrapeResult, 'videoPath'>> => {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    log.info(`Page URL before comment scrape: ${page.url()}`);
    const initialComments = await extractAllComments(page);
    const allCommentsFilterApplied = await switchToAllComments(page);
    const comments = allCommentsFilterApplied ? await extractAllComments(page) : initialComments;

    log.info(`Page URL before reaction scrape: ${page.url()}`);
    const reactions = await extractAllReactions(page);

    return {
        inputUrl,
        finalUrl: page.url(),
        scrapedAt: new Date().toISOString(),
        reactionCount: reactions.length,
        commentCount: comments.length,
        allCommentsFilterApplied,
        reactions,
        comments,
    };
};

const finalizeVideoPath = async (video: Video | null): Promise<string | undefined> => {
    if (!video) return undefined;

    try {
        return await video.path();
    } catch {
        return undefined;
    }
};

const closeContextIfOwned = async (context: BrowserContext, ownsContext: boolean): Promise<void> => {
    if (!ownsContext) return;
    await context.close().catch(() => undefined);
};

export const runWithExternalChrome = async (input: FacebookScraperInput): Promise<ScrapeResult> => {
    if (!input.externalChromeCdpUrl) throw new Error('externalChromeCdpUrl is required for browserMode="cdp".');

    log.info(`Connecting to external Chrome at ${input.externalChromeCdpUrl}...`);
    const browser = await chromium.connectOverCDP(input.externalChromeCdpUrl);
    const existingContext = browser.contexts()[0];
    const context = existingContext ?? await browser.newContext();
    const ownsContext = !existingContext;
    const page = await context.newPage();
    const video = input.recordVideo ? page.video() : null;

    try {
        const resolvedPostUrl = await resolveFacebookPostUrl(input.url);
        if (resolvedPostUrl !== input.url) log.info(`Resolved shared URL to: ${resolvedPostUrl}`);

        await page.goto(resolvedPostUrl, {
            waitUntil: 'domcontentloaded',
            timeout: input.requestHandlerTimeoutSecs * 1000,
        });

        const result = await scrapeLoadedPage(page, input.url, input.waitAfterNavigationMs);
        await page.close().catch(() => undefined);
        const videoPath = await finalizeVideoPath(video);
        if (input.recordVideo && !videoPath) {
            log.warning('recordVideo=true but no Playwright video was available in CDP mode.');
        }

        return { ...result, videoPath };
    } finally {
        await closeContextIfOwned(context, ownsContext);
        await browser.close().catch(() => undefined);
    }
};

export const runWithManagedBrowser = async (input: FacebookScraperInput): Promise<ScrapeResult> => {
    const browser = await chromium.launch({ headless: input.headless });
    const context = await browser.newContext(input.recordVideo
        ? { recordVideo: { dir: 'storage/key_value_stores/default', size: { width: 1280, height: 720 } } }
        : undefined);

    const page = await context.newPage();
    const video = input.recordVideo ? page.video() : null;
    try {
        await page.goto(input.url, {
            waitUntil: 'domcontentloaded',
            timeout: input.requestHandlerTimeoutSecs * 1000,
        });

        const result = await scrapeLoadedPage(page, input.url, input.waitAfterNavigationMs);
        await page.close().catch(() => undefined);
        const videoPath = await finalizeVideoPath(video);
        return { ...result, videoPath };
    } finally {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
};
