import type { BrowserContext } from 'playwright';

import { log } from '../common/logger.js';
import { launchPersistentChromeContext } from '../common/persistent-browser.js';
import type { LaunchBrowserOptions, ProfileLoginOptions, RunScrapeOptions } from '../common/types.js';
import { slowlyScrollToTop } from '../common/video-context.js';
import { COMMENT_REACTIONS_SCRAPER, scrapeCommentReactions } from './scrapers/comment-reactions/index.js';
import { POST_ENGAGEMENT_SCRAPER, scrapePostEngagement } from './scrapers/post-engagement/index.js';
import { resolveFacebookPostUrl } from './shared/url.js';
import type { FacebookPlugin, FacebookScrapeResult } from './types.js';
import { getLoginUrl, getProfileDir } from './profile.js';

const launchPersistentBrowser = async (options: LaunchBrowserOptions): Promise<BrowserContext> => {
    return launchPersistentChromeContext({
        profileDir: getProfileDir(options.profileRootDir),
        executablePath: options.chromeExecutable,
        recordVideoDir: options.recordVideoDir,
    });
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
    const page = await context.newPage();
    let pageClosed = false;
    const closePage = async (): Promise<void> => {
        if (pageClosed) return;
        pageClosed = true;
        await page.close().catch(() => undefined);
    };

    try {
        const resolvedPostUrl = await (resolveFacebookPostUrl as (url: string) => Promise<string>)(targetUrl);
        if (resolvedPostUrl !== targetUrl) log.info(`Resolved shared URL to: ${resolvedPostUrl}`);

        await page.goto(resolvedPostUrl, {
            waitUntil: 'domcontentloaded',
            timeout: options.requestTimeoutSecs * 1000,
        });

        let scrapeResult: FacebookScrapeResult;
        if (scraper === POST_ENGAGEMENT_SCRAPER) {
            scrapeResult = await scrapePostEngagement(page, targetUrl, resolvedPostUrl, options.waitAfterNavigationMs);
        } else if (scraper === COMMENT_REACTIONS_SCRAPER) {
            scrapeResult = await scrapeCommentReactions(page, targetUrl, resolvedPostUrl, options.waitAfterNavigationMs);
        } else {
            throw new Error(`Unsupported Facebook scraper: ${scraper}`);
        }

        if (options.screenVideo) await slowlyScrollToTop(page);

        await closePage();
        return scrapeResult;
    } catch (error) {
        await closePage();
        throw error;
    }
};

export const facebookPlugin: FacebookPlugin = {
    target: 'facebook',
    scrapers: [POST_ENGAGEMENT_SCRAPER, COMMENT_REACTIONS_SCRAPER],
    getProfileDir,
    launchPersistentBrowser,
    openProfileLoginBrowser,
    runScrape,
};
