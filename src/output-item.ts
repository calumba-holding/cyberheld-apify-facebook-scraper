import type { ScrapedComment } from './comment-models.js';
import type { ScrapeResult } from './external-chrome.js';
import type { BrowserMode } from './input.js';
import type { ReactionUser } from './reactions.js';

export type VideoArtifact = {
    present: boolean;
    key?: string;
    contentType?: 'video/mp4' | 'video/webm';
    localPath?: string;
};

export type ScrapeDatasetItem = {
    input: { url: string };
    scrape: {
        jobId: string;
        status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
        scrapedAt: string;
        browserMode: BrowserMode;
        error?: string;
    };
    completeness: {
        allCommentsFilterApplied: boolean;
        commentsExtracted: boolean;
        postReactionsExtracted: boolean;
    };
    post: {
        url: string;
        reactionSummary: { total: number };
        reactions: ReactionUser[];
    };
    comments: ScrapedComment[];
    artifacts: { video: VideoArtifact };
};

const toStatus = (result: ScrapeResult): 'SUCCEEDED' | 'PARTIAL' => {
    const commentsExtracted = result.comments.length > 0;
    const postReactionsExtracted = result.reactions.length > 0;
    if (result.allCommentsFilterApplied && commentsExtracted && postReactionsExtracted) return 'SUCCEEDED';
    return 'PARTIAL';
};

export const buildSuccessDatasetItem = (
    result: ScrapeResult,
    jobId: string,
    browserMode: BrowserMode,
    video: VideoArtifact,
): ScrapeDatasetItem => {
    return {
        input: { url: result.inputUrl },
        scrape: {
            jobId,
            status: toStatus(result),
            scrapedAt: result.scrapedAt,
            browserMode,
        },
        completeness: {
            allCommentsFilterApplied: result.allCommentsFilterApplied,
            commentsExtracted: result.comments.length > 0,
            postReactionsExtracted: result.reactions.length > 0,
        },
        post: {
            url: result.finalUrl,
            reactionSummary: { total: result.reactionCount },
            reactions: result.reactions,
        },
        comments: result.comments,
        artifacts: { video },
    };
};

export const buildFailedDatasetItem = (
    inputUrl: string,
    jobId: string,
    browserMode: BrowserMode,
    error: string,
): ScrapeDatasetItem => {
    return {
        input: { url: inputUrl },
        scrape: {
            jobId,
            status: 'FAILED',
            scrapedAt: new Date().toISOString(),
            browserMode,
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
        artifacts: { video: { present: false } },
    };
};
