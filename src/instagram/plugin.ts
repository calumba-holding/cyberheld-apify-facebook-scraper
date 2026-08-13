import type { BrowserContext } from 'playwright';

import { log } from '../common/logger.js';
import { persistPageVideo } from '../common/page-video.js';
import { launchPersistentChromeContext } from '../common/persistent-browser.js';
import { slowlyScrollToTop } from '../common/video-context.js';
import type { LaunchBrowserOptions, ProfileLoginOptions, RunScrapeOptions } from '../common/types.js';
import { POST_ENGAGEMENT_SCRAPER, scrapePostEngagement } from './scrapers/post-engagement/index.js';
import { POST_SCREENSHOT_SCRAPER, scrapePostScreenshot } from './scrapers/post-screenshot/index.js';
import { PROFILE_SCRAPER, scrapeProfile } from './scrapers/profile-scraper/index.js';
import { captureInstagramBlockedPageArtifact } from './shared/block-diagnostics.js';
import { isInstagramLoginOrChallengeUrl, isInstagramPostOrReelUrl } from './shared/url.js';
import { INSTAGRAM_EVIDENCE_VIEWPORT } from './scrapers/post-screenshot/interactions.js';
import type { InstagramPlugin, InstagramScrapeResult } from './types.js';
import { getLoginUrl, getProfileDir } from './profile.js';

const launchBrowser = async (options: LaunchBrowserOptions): Promise<BrowserContext> => {
    if (options.browserSessionMode === 'guest-session') {
        throw new Error('Instagram scraping requires the persistent target profile.');
    }

    return launchPersistentChromeContext({
        profileDir: getProfileDir(options.profileRootDir),
        executablePath: options.chromeExecutable,
        recordVideoDir: options.recordVideoDir,
    });
};

const openProfileLoginBrowser = async (options: ProfileLoginOptions): Promise<BrowserContext> => {
    const context = await launchBrowser({ ...options, browserSessionMode: 'persistent-profile' });
    const page = context.pages()[0] ?? await context.newPage();
    try {
        await page.goto(getLoginUrl(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (error) {
        log.warning(`Instagram login page navigation did not settle; keeping the browser open for noVNC: ${error instanceof Error ? error.message : String(error)}`);
    }
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
        if (scraper === POST_SCREENSHOT_SCRAPER && !isInstagramPostOrReelUrl(targetUrl)) {
            throw new Error('Instagram post-screenshot requires a post or reel URL (/p/, /reel/, /tv/).');
        }

        if (scraper === POST_SCREENSHOT_SCRAPER) {
            await page.setViewportSize(INSTAGRAM_EVIDENCE_VIEWPORT);
        }

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: options.requestTimeoutSecs * 1000 });
        const finalUrl = page.url();

        if (scraper === POST_SCREENSHOT_SCRAPER && isInstagramLoginOrChallengeUrl(finalUrl)) {
            const blockedPage = await captureInstagramBlockedPageArtifact(page, finalUrl, options);
            const error = new Error(
                'Instagram redirected to login or challenge. Log in with: node dist/main.js profile login --target instagram',
            ) as Error & { blockedPage?: typeof blockedPage };
            error.blockedPage = blockedPage;
            throw error;
        }

        let result: InstagramScrapeResult;
        if (scraper === POST_ENGAGEMENT_SCRAPER) {
            result = await scrapePostEngagement(page, targetUrl, finalUrl, options.waitAfterNavigationMs);
        } else if (scraper === POST_SCREENSHOT_SCRAPER) {
            log.info('Starting Instagram post-screenshot evidence capture...');
            result = await scrapePostScreenshot(page, targetUrl, finalUrl, options);
        } else if (scraper === PROFILE_SCRAPER) {
            result = await scrapeProfile(page, targetUrl, finalUrl, options);
        } else {
            throw new Error(`Unsupported Instagram scraper: ${scraper}`);
        }

        if (options.screenVideo) await slowlyScrollToTop(page);
        await page.close().catch(() => undefined);

        if (options.screenVideo && result.kind === 'screenshot') {
            const sessionVideo = await persistPageVideo(page, options);
            if (sessionVideo) result = { ...result, sessionVideo };
        }

        return result;
    } catch (error) {
        await page.close().catch(() => undefined);
        throw error;
    }
};

export const instagramPlugin: InstagramPlugin = {
    target: 'instagram',
    scrapers: [POST_ENGAGEMENT_SCRAPER, POST_SCREENSHOT_SCRAPER, PROFILE_SCRAPER],
    getProfileDir,
    launchBrowser,
    openProfileLoginBrowser,
    runScrape,
};
