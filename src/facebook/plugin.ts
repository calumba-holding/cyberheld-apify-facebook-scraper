import type { BrowserContext } from 'playwright';

import { log } from '../common/logger.js';
import { launchPersistentChromeContext, launchTemporaryChromeContext } from '../common/persistent-browser.js';
import type { LaunchBrowserOptions, ProfileLoginOptions, RunScrapeOptions } from '../common/types.js';
import { slowlyScrollToTop } from '../common/video-context.js';
import { COMMENT_REACTIONS_SCRAPER, scrapeCommentReactions } from './scrapers/comment-reactions/index.js';
import { POST_ENGAGEMENT_SCRAPER, scrapePostEngagement } from './scrapers/post-engagement/index.js';
import { captureFacebookBlockedPageArtifact } from './shared/block-diagnostics.js';
import { prepareFacebookGuestPage, warmFacebookPublicSession } from './shared/guest-session.js';
import { extractFacebookPageRootUrl, isEquivalentFacebookTargetUrl, isFacebookLoginOrHomeUrl, resolveFacebookPostUrl, sanitizeFacebookPostUrl } from './shared/url.js';
import type { FacebookPlugin, FacebookScrapeResult } from './types.js';
import { getLoginUrl, getProfileDir } from './profile.js';

const launchBrowser = async (options: LaunchBrowserOptions): Promise<BrowserContext> => {
    if (options.browserSessionMode === 'guest-session') {
        return launchTemporaryChromeContext({
            executablePath: options.chromeExecutable,
            profilePrefix: 'scrape-facebook-guest-',
            recordVideoDir: options.recordVideoDir,
            stealth: true,
        });
    }

    return launchPersistentChromeContext({
        profileDir: getProfileDir(options.profileRootDir, options.browserSessionMode),
        executablePath: options.chromeExecutable,
        recordVideoDir: options.recordVideoDir,
        stealth: options.browserSessionMode === 'public-session',
    });
};

const openProfileLoginBrowser = async (options: ProfileLoginOptions): Promise<BrowserContext> => {
    const context = await launchBrowser({ ...options, browserSessionMode: 'persistent-profile' });
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
        const resolvedEntryUrl = await resolveFacebookPostUrl(targetUrl);
        if (resolvedEntryUrl !== targetUrl) log.info(`Resolved shared URL to: ${resolvedEntryUrl}`);

        if (options.browserSessionMode === 'public-session' || options.browserSessionMode === 'guest-session') {
            await warmFacebookPublicSession(
                page,
                extractFacebookPageRootUrl(resolvedEntryUrl) ?? getLoginUrl(),
                Math.min(options.requestTimeoutSecs * 1000, 30000),
            );
        }

        await page.goto(resolvedEntryUrl, {
            waitUntil: 'domcontentloaded',
            timeout: options.requestTimeoutSecs * 1000,
        });

        if (options.browserSessionMode === 'guest-session') {
            await prepareFacebookGuestPage(page);
        }

        const finalUrl = sanitizeFacebookPostUrl(page.url());
        if (finalUrl !== resolvedEntryUrl) log.info(`Facebook navigation landed on: ${finalUrl}`);
        if (!isEquivalentFacebookTargetUrl(resolvedEntryUrl, finalUrl)) {
            const blockedPage = await captureFacebookBlockedPageArtifact(page, finalUrl, options);
            const error = new Error(
                isFacebookLoginOrHomeUrl(finalUrl)
                    ? 'Facebook redirected away from the requested post to a login/home page. This usually means a login wall or bot check blocked the scrape.'
                    : `Facebook redirected away from the requested post: ${finalUrl}`,
            ) as Error & { blockedPage?: Awaited<ReturnType<typeof captureFacebookBlockedPageArtifact>> };
            error.blockedPage = blockedPage;
            throw error;
        }

        let scrapeResult: FacebookScrapeResult;
        if (scraper === POST_ENGAGEMENT_SCRAPER) {
            scrapeResult = await scrapePostEngagement(page, targetUrl, finalUrl, options.waitAfterNavigationMs, {
                artifactRootDir: options.artifactRootDir,
                browserSessionMode: options.browserSessionMode,
                download: options.download ?? true,
                itemIndex: options.itemIndex,
                outputFile: options.outputFile,
                profileDir: getProfileDir(options.profileRootDir, options.browserSessionMode),
                runId: options.runId,
            });
        } else if (scraper === COMMENT_REACTIONS_SCRAPER) {
            scrapeResult = await scrapeCommentReactions(page, targetUrl, finalUrl, options.waitAfterNavigationMs);
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
    launchBrowser,
    openProfileLoginBrowser,
    runScrape,
};
