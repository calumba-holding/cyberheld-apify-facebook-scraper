import type { BrowserContext } from 'playwright';

import { launchPersistentChromeContext } from '../common/persistent-browser.js';
import { slowlyScrollToTop } from '../common/video-context.js';
import type { LaunchBrowserOptions, ProfileLoginOptions, RunScrapeOptions } from '../common/types.js';
import { POST_ENGAGEMENT_SCRAPER, scrapePostEngagement } from './scrapers/post-engagement/index.js';
import type { InstagramPlugin, InstagramScrapeResult } from './types.js';
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
    await page.goto(getLoginUrl(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    return context;
};

const runScrape = async (
    context: BrowserContext,
    scraper: string,
    targetUrl: string,
    options: RunScrapeOptions,
): Promise<InstagramScrapeResult> => {
    const page = await context.newPage();

    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: options.requestTimeoutSecs * 1000 });
        if (scraper !== POST_ENGAGEMENT_SCRAPER) throw new Error(`Unsupported Instagram scraper: ${scraper}`);

        const result = await scrapePostEngagement(page, targetUrl, page.url(), options.waitAfterNavigationMs);
        if (options.screenVideo) await slowlyScrollToTop(page);
        await page.close().catch(() => undefined);
        return result;
    } catch (error) {
        await page.close().catch(() => undefined);
        throw error;
    }
};

export const instagramPlugin: InstagramPlugin = {
    target: 'instagram',
    scrapers: [POST_ENGAGEMENT_SCRAPER],
    getProfileDir,
    launchPersistentBrowser,
    openProfileLoginBrowser,
    runScrape,
};
