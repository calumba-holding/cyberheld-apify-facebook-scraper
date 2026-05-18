import type {
    BlockedPageArtifact,
    BrowserSessionMode,
    EngagementScrapeResult,
    ScrapeResult,
    SupportedTarget,
} from './types.js';
import type { ScrapeBrowser, ScrapeItemOutput, ScrapeRunOutput, VideoArtifact } from './output-types.js';

export type { ScrapeBrowser, ScrapeItemOutput, ScrapeRunOutput, VideoArtifact } from './output-types.js';

const resolveBrowserLabel = (browserSessionMode: BrowserSessionMode): ScrapeBrowser => {
    return browserSessionMode === 'guest-session' ? 'guest-chrome-session' : 'persistent-chrome-profile';
};

const resolveCommentsComplete = (result: EngagementScrapeResult): boolean => {
    return result.commentsComplete ?? result.comments.length > 0;
};

const resolvePostReactionsComplete = (result: EngagementScrapeResult): boolean => {
    return result.postReactionsComplete ?? result.reactions.length > 0;
};

const resolveCommentVisibilityComplete = (result: EngagementScrapeResult): boolean => {
    return result.commentVisibilityComplete ?? resolveCommentsComplete(result);
};

const toStatus = (result: ScrapeResult): 'SUCCEEDED' | 'PARTIAL' => {
    if (result.status) return result.status;
    if (result.kind === 'profile') {
        return result.screenshots.length > 0 ? 'SUCCEEDED' : 'PARTIAL';
    }

    const commentsComplete = resolveCommentsComplete(result);
    const postReactionsComplete = resolvePostReactionsComplete(result);
    if (commentsComplete && postReactionsComplete) return 'SUCCEEDED';
    return 'PARTIAL';
};

const buildEngagementArtifacts = (result: EngagementScrapeResult): ScrapeItemOutput['artifacts'] | undefined => {
    const artifacts: ScrapeItemOutput['artifacts'] = {};
    if (result.sourceVideo) artifacts.sourceVideo = result.sourceVideo;
    if (result.selfHealing?.length) artifacts.selfHealing = result.selfHealing;
    return Object.keys(artifacts).length > 0 ? artifacts : undefined;
};

export const buildSuccessOutput = (
    result: ScrapeResult,
    jobId: string,
    browserSessionMode: BrowserSessionMode = 'persistent-profile',
): ScrapeItemOutput => {
    const baseOutput = {
        input: { targetUrl: result.inputUrl },
        scrape: {
            jobId,
            status: toStatus(result),
            scrapedAt: result.scrapedAt,
            runtime: 'cli' as const,
            browser: resolveBrowserLabel(browserSessionMode),
        },
    };

    if (result.kind === 'profile') {
        return {
            ...baseOutput,
            profile: result.profile,
            artifacts: result.screenshots.length > 0 ? { screenshots: result.screenshots } : undefined,
        };
    }

    return {
        ...baseOutput,
        completeness: {
            allCommentsFilterApplied: resolveCommentVisibilityComplete(result),
            commentsExtracted: resolveCommentsComplete(result),
            postReactionsExtracted: resolvePostReactionsComplete(result),
        },
        post: {
            url: result.finalUrl,
            content: result.postContent,
            reactionSummary: { total: result.reactionCount },
            reactions: result.reactions,
        },
        comments: result.comments,
        artifacts: buildEngagementArtifacts(result),
    };
};

export const buildFailedOutput = (
    inputUrl: string,
    jobId: string,
    error: string,
    browserSessionMode: BrowserSessionMode = 'persistent-profile',
    blockedPage?: BlockedPageArtifact,
): ScrapeItemOutput => ({
    input: { targetUrl: inputUrl },
    scrape: {
        jobId,
        status: 'FAILED',
        scrapedAt: new Date().toISOString(),
        runtime: 'cli',
        browser: resolveBrowserLabel(browserSessionMode),
        error,
    },
    completeness: {
        allCommentsFilterApplied: false,
        commentsExtracted: false,
        postReactionsExtracted: false,
    },
    post: {
        url: inputUrl,
        reactionSummary: { total: 0 },
        reactions: [],
    },
    comments: [],
    artifacts: {
        screenshots: [],
        blockedPage: blockedPage ? {
            finalUrl: blockedPage.finalUrl,
            screenshot: blockedPage.screenshot,
            html: blockedPage.html,
        } : undefined,
    },
});

export const buildRunOutput = (
    target: SupportedTarget,
    scraper: string,
    profileDir: string,
    browserSessionMode: BrowserSessionMode,
    runId: string,
    startedAt: string,
    finishedAt: string,
    concurrency: number,
    requestedUrls: number,
    video: VideoArtifact,
    results: ScrapeItemOutput[],
): ScrapeRunOutput => {
    const summary = results.reduce((acc, result) => {
        if (result.scrape.status === 'FAILED') acc.failed += 1;
        else if (result.scrape.status === 'PARTIAL') acc.partial += 1;
        else acc.succeeded += 1;
        return acc;
    }, { succeeded: 0, partial: 0, failed: 0 });

    return {
        target,
        scraper,
        profileDir,
        run: {
            runId,
            startedAt,
            finishedAt,
            concurrency,
            requestedUrls,
            browserSession: browserSessionMode,
        },
        summary,
        artifacts: { video },
        results,
    };
};
