import { mkdir } from 'node:fs/promises';

import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';

import { log } from '../common/logger.js';
import type { LaunchBrowserOptions, ProfileLoginOptions, RunScrapeOptions } from '../common/types.js';
import type { FacebookPlugin, FacebookScrapeResult } from './types.js';
import { switchToAllComments } from './comment-filter.js';
import { extractAllComments } from './comments.js';
import { extractPostContent } from './post-extraction.js';
import { findTargetPostRoot } from './post-root.js';
import { getLoginUrl, getProfileDir } from './profile.js';
import { extractAllReactions } from './reactions.js';

const POST_ENGAGEMENT_SCRAPER = 'post-engagement';

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

const closeExtraBlankPages = async (context: BrowserContext): Promise<void> => {
    const blankPages = context.pages().filter((page) => page.url() === 'about:blank');
    await Promise.all(blankPages.map(async (page) => {
        await page.close().catch(() => undefined);
    }));
};

const resolvePostScope = async (page: Page, targetUrl: string): Promise<Locator> => {
    const root = await findTargetPostRoot(page, targetUrl);
    if (!root) {
        log.warning('Could not isolate the target Facebook post container. Falling back to page scope.');
        return page.locator('body');
    }

    log.info('Scoped extraction to the target Facebook post container.');
    return root;
};

const scrapePostEngagement = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    waitAfterNavigationMs: number,
): Promise<FacebookScrapeResult> => {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    const scope: Locator = await resolvePostScope(page, finalUrl);
    const postContent = await extractPostContent(scope);

    log.info(`Page URL before comment scrape: ${page.url()}`);
    const initialComments = await extractAllComments(page, scope);
    const commentFilter = await switchToAllComments(page, scope);
    const comments = commentFilter.shouldReloadComments
        ? await extractAllComments(page, scope)
        : initialComments;

    log.info(`Page URL before reaction scrape: ${page.url()}`);
    const reactions = await extractAllReactions(page, scope);

    return {
        inputUrl,
        finalUrl,
        scrapedAt: new Date().toISOString(),
        reactionCount: reactions.length,
        commentCount: comments.length,
        allCommentsFilterApplied: commentFilter.applied,
        postContent,
        reactions,
        comments,
    };
};

const launchPersistentBrowser = async (options: LaunchBrowserOptions): Promise<BrowserContext> => {
    const profileDir = getProfileDir(options.profileRootDir);
    await mkdir(profileDir, { recursive: true });
    const recordingEnabled = Boolean(options.recordVideoDir);

    log.info(`Launching persistent Chrome profile at ${profileDir}`);
    const context = await chromium.launchPersistentContext(profileDir, {
        executablePath: options.chromeExecutable,
        headless: false,
        viewport: recordingEnabled ? { width: 1280, height: 720 } : null,
        args: recordingEnabled ? ['--window-size=1280,720', '--disable-gpu'] : undefined,
        recordVideo: options.recordVideoDir
            ? { dir: options.recordVideoDir, size: { width: 1280, height: 720 } }
            : undefined,
    });

    await closeExtraBlankPages(context);
    return context;
};

const openProfileLoginBrowser = async (options: ProfileLoginOptions): Promise<BrowserContext> => {
    const context = await launchPersistentBrowser(options);
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(getLoginUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    return context;
};

const runScrape = async (
    context: BrowserContext,
    scraper: string,
    targetUrl: string,
    options: RunScrapeOptions,
): Promise<FacebookScrapeResult> => {
    if (scraper !== POST_ENGAGEMENT_SCRAPER) {
        throw new Error(`Unsupported Facebook scraper: ${scraper}`);
    }

    const page = await context.newPage();
    const pageVideo = page.video();
    let pageClosed = false;
    const closePage = async (): Promise<void> => {
        if (pageClosed) return;
        pageClosed = true;
        await page.close().catch(() => undefined);
    };

    try {
        const resolvedPostUrl = await resolveFacebookPostUrl(targetUrl);
        if (resolvedPostUrl !== targetUrl) log.info(`Resolved shared URL to: ${resolvedPostUrl}`);

        await page.goto(resolvedPostUrl, {
            waitUntil: 'domcontentloaded',
            timeout: options.requestTimeoutSecs * 1000,
        });

        const scrapeResult = await scrapePostEngagement(page, targetUrl, resolvedPostUrl, options.waitAfterNavigationMs);
        await closePage();
        const videoPath = pageVideo ? await pageVideo.path().catch(() => undefined) : undefined;
        return { ...scrapeResult, videoPath };
    } catch (error) {
        await closePage();
        throw error;
    }
};

export const facebookPlugin: FacebookPlugin = {
    target: 'facebook',
    scrapers: [POST_ENGAGEMENT_SCRAPER],
    getProfileDir,
    launchPersistentBrowser,
    openProfileLoginBrowser,
    runScrape,
};
