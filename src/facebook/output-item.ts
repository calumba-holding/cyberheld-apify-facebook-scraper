import type { SupportedTarget } from '../common/types.js';
import type { ReactionUser, FacebookScrapeResult, ScrapedComment } from './types.js';

export type VideoArtifact = {
    present: boolean;
    localPath?: string;
};

export type ScrapeItemOutput = {
    input: { targetUrl: string };
    scrape: {
        jobId: string;
        status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
        scrapedAt: string;
        runtime: 'cli';
        browser: 'persistent-chrome-profile';
        error?: string;
    };
    completeness: {
        allCommentsFilterApplied: boolean;
        commentsExtracted: boolean;
        postReactionsExtracted: boolean;
    };
    post: {
        url: string;
        content?: string;
        reactionSummary: { total: number };
        reactions: ReactionUser[];
    };
    comments: ScrapedComment[];
};

export type ScrapeRunOutput = {
    target: SupportedTarget;
    scraper: string;
    profileDir: string;
    run: {
        runId: string;
        startedAt: string;
        finishedAt: string;
        concurrency: number;
        requestedUrls: number;
    };
    summary: {
        succeeded: number;
        partial: number;
        failed: number;
    };
    artifacts: { video: VideoArtifact };
    results: ScrapeItemOutput[];
};

const toStatus = (result: FacebookScrapeResult): 'SUCCEEDED' | 'PARTIAL' => {
    if (result.status) return result.status;

    const commentsExtracted = result.comments.length > 0;
    const postReactionsExtracted = result.reactions.length > 0;
    if (result.allCommentsFilterApplied && commentsExtracted && postReactionsExtracted) return 'SUCCEEDED';
    return 'PARTIAL';
};

export const buildSuccessOutput = (
    result: FacebookScrapeResult,
    jobId: string,
): ScrapeItemOutput => ({
    input: { targetUrl: result.inputUrl },
    scrape: {
        jobId,
        status: toStatus(result),
        scrapedAt: result.scrapedAt,
        runtime: 'cli',
        browser: 'persistent-chrome-profile',
    },
    completeness: {
        allCommentsFilterApplied: result.allCommentsFilterApplied,
        commentsExtracted: result.comments.length > 0,
        postReactionsExtracted: result.reactions.length > 0,
    },
    post: {
        url: result.finalUrl,
        content: result.postContent,
        reactionSummary: { total: result.reactionCount },
        reactions: result.reactions,
    },
    comments: result.comments,
});

export const buildFailedOutput = (
    inputUrl: string,
    jobId: string,
    error: string,
): ScrapeItemOutput => ({
    input: { targetUrl: inputUrl },
    scrape: {
        jobId,
        status: 'FAILED',
        scrapedAt: new Date().toISOString(),
        runtime: 'cli',
        browser: 'persistent-chrome-profile',
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
});

export const buildRunOutput = (
    target: SupportedTarget,
    scraper: string,
    profileDir: string,
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
        },
        summary,
        artifacts: { video },
        results,
    };
};
