import type { BrowserContext, Page } from 'playwright';

import { log } from '../common/logger.js';
import { launchPersistentChromeContext, launchTemporaryChromeContext } from '../common/persistent-browser.js';
import type { LaunchBrowserOptions, ProfileLoginOptions, RunScrapeOptions } from '../common/types.js';
import { slowlyScrollToTop } from '../common/video-context.js';
import { COMMENT_REACTIONS_SCRAPER, scrapeCommentReactions } from './scrapers/comment-reactions/index.js';
import { POST_ENGAGEMENT_SCRAPER, scrapePostEngagement } from './scrapers/post-engagement/index.js';
import { POST_SCREENSHOT_SCRAPER, scrapePostScreenshot } from './scrapers/post-screenshot/index.js';
import type { GraphqlRequestTemplate } from './scrapers/post-engagement/public-post-api-graphql.js';
import { tryOpenFacebookPublicPostViaPageRoot } from './scrapers/post-engagement/public-post-api.js';
import { assertFacebookAuthenticatedContext } from './session.js';
import { captureFacebookBlockedPageArtifact } from './shared/block-diagnostics.js';
import { prepareFacebookGuestPage, warmFacebookPublicSession } from './shared/guest-session.js';
import {
    extractFacebookPageRootUrl,
    isEquivalentFacebookTargetUrl,
    isFacebookLoginOrHomeUrl,
    resolveFacebookPostUrl,
    rewriteFacebookReelUrlToWatchUrl,
    sanitizeFacebookPostUrl,
} from './shared/url.js';
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

/** Run post-engagement on an existing tab (watch mode — does not close the page). */
export const runPostEngagementScrapeOnPage = async (
    page: Page,
    targetUrl: string,
    options: RunScrapeOptions,
): Promise<FacebookScrapeResult> => {
    const resolvedTargetUrl = await resolveFacebookPostUrl(targetUrl);
    if (resolvedTargetUrl !== targetUrl) log.info(`Resolved shared URL to: ${resolvedTargetUrl}`);

    const resolvedEntryUrl = options.browserSessionMode === 'public-session'
        ? rewriteFacebookReelUrlToWatchUrl(resolvedTargetUrl)
        : resolvedTargetUrl;

    await page.goto(resolvedEntryUrl, {
        waitUntil: 'domcontentloaded',
        timeout: options.requestTimeoutSecs * 1000,
    });

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

    return scrapePostEngagement(page, targetUrl, finalUrl, options.waitAfterNavigationMs, {
        artifactRootDir: options.artifactRootDir,
        browserSessionMode: options.browserSessionMode,
        download: options.download ?? true,
        itemIndex: options.itemIndex,
        outputFile: options.outputFile,
        profileDir: getProfileDir(options.profileRootDir, options.browserSessionMode),
        regenerateScript: options.regenerateScript ?? false,
        runId: options.runId,
        commentsOnly: options.commentsOnly,
    });
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
        // GATE: an authenticated (persistent-profile) scrape must run on a signed-in session.
        if (options.browserSessionMode === 'persistent-profile') {
            await assertFacebookAuthenticatedContext(context);
        }

        if (scraper === POST_ENGAGEMENT_SCRAPER && options.browserSessionMode === 'persistent-profile') {
            const scrapeResult = await runPostEngagementScrapeOnPage(page, targetUrl, options);
            await closePage();
            return scrapeResult;
        }

        const resolvedTargetUrl = await resolveFacebookPostUrl(targetUrl);
        if (resolvedTargetUrl !== targetUrl) log.info(`Resolved shared URL to: ${resolvedTargetUrl}`);

        const resolvedEntryUrl = options.browserSessionMode === 'public-session'
            ? rewriteFacebookReelUrlToWatchUrl(resolvedTargetUrl)
            : resolvedTargetUrl;
        if (resolvedEntryUrl !== resolvedTargetUrl) {
            log.info(`Rewrote public Facebook reel URL to watch URL: ${resolvedEntryUrl}`);
        }

        const shouldWarmBeforeNavigation = !(options.browserSessionMode === 'public-session' && scraper === POST_ENGAGEMENT_SCRAPER);
        if ((options.browserSessionMode === 'public-session' || options.browserSessionMode === 'guest-session') && shouldWarmBeforeNavigation) {
            await warmFacebookPublicSession(
                page,
                extractFacebookPageRootUrl(resolvedEntryUrl) ?? getLoginUrl(),
                Math.min(options.requestTimeoutSecs * 1000, 30000),
            );
        }

        let publicPostApiPayload: string | undefined;
        let publicPostFinalUrl: string | undefined;
        let publicGraphqlTemplate: GraphqlRequestTemplate | undefined;
        if (options.browserSessionMode === 'public-session' && scraper === POST_ENGAGEMENT_SCRAPER) {
            const publicNavigation = await tryOpenFacebookPublicPostViaPageRoot(page, resolvedEntryUrl, options.requestTimeoutSecs * 1000);
            if (publicNavigation) {
                publicPostApiPayload = publicNavigation.singlePostPayload?.body;
                publicPostFinalUrl = publicNavigation.finalUrl;
            } else {
                await page.goto(resolvedEntryUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: options.requestTimeoutSecs * 1000,
                });
            }
        } else if (scraper !== POST_ENGAGEMENT_SCRAPER) {
            const capturePublicTemplate = (request: import('playwright').Request): void => {
                if (publicGraphqlTemplate || !request.url().includes('/api/graphql/')) return;
                const params = new URLSearchParams(request.postData() || '');
                if (params.get('fb_api_req_friendly_name') !== 'ProfileCometTimelineFeedRefetchQuery') return;
                publicGraphqlTemplate = {
                    params: Object.fromEntries(params.entries()),
                    requestCount: 0,
                };
            };
            if (options.browserSessionMode === 'public-session' && scraper === COMMENT_REACTIONS_SCRAPER) {
                page.on('request', capturePublicTemplate);
            }
            await page.goto(resolvedEntryUrl, {
                waitUntil: 'domcontentloaded',
                timeout: options.requestTimeoutSecs * 1000,
            });
            if (options.browserSessionMode === 'public-session' && scraper === COMMENT_REACTIONS_SCRAPER) {
                page.off('request', capturePublicTemplate);
            }
        }

        if (options.browserSessionMode === 'guest-session') {
            await prepareFacebookGuestPage(page);
        }

        const finalUrl = publicPostFinalUrl ?? sanitizeFacebookPostUrl(page.url());
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
        if (scraper === POST_SCREENSHOT_SCRAPER) {
            scrapeResult = await scrapePostScreenshot(page, targetUrl, finalUrl, options);
        } else if (scraper === POST_ENGAGEMENT_SCRAPER) {
            scrapeResult = await scrapePostEngagement(page, targetUrl, finalUrl, options.waitAfterNavigationMs, {
                artifactRootDir: options.artifactRootDir,
                browserSessionMode: options.browserSessionMode,
                download: options.download ?? true,
                itemIndex: options.itemIndex,
                outputFile: options.outputFile,
                profileDir: getProfileDir(options.profileRootDir, options.browserSessionMode),
                publicPostApiPayload,
                regenerateScript: options.regenerateScript ?? false,
                runId: options.runId,
            });
        } else if (scraper === COMMENT_REACTIONS_SCRAPER) {
            scrapeResult = await scrapeCommentReactions(page, targetUrl, finalUrl, options.waitAfterNavigationMs, {
                browserSessionMode: options.browserSessionMode,
                publicGraphqlTemplate,
                regenerateScript: options.regenerateScript ?? false,
            });
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
    scrapers: [POST_ENGAGEMENT_SCRAPER, POST_SCREENSHOT_SCRAPER, COMMENT_REACTIONS_SCRAPER],
    getProfileDir,
    launchBrowser,
    openProfileLoginBrowser,
    runScrape,
};
