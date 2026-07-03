import type {
    BrowserSessionMode,
    LocalFileArtifact,
    ProfileData,
    ReactionUser,
    ScrapedComment,
    ScreenshotArtifact,
    SelfHealingArtifact,
    SupportedTarget,
} from './types.js';

export type VideoArtifact = {
    present: boolean;
    localPath?: string;
};

export type ScrapeBrowser = 'persistent-chrome-profile' | 'guest-chrome-session';

export type ScrapeItemOutput = {
    input: { targetUrl: string };
    scrape: {
        jobId: string;
        status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
        scrapedAt: string;
        runtime: 'cli';
        browser: ScrapeBrowser;
        error?: string;
        attempts?: number;
    };
    completeness?: {
        allCommentsFilterApplied: boolean;
        commentsExtracted: boolean;
        postReactionsExtracted: boolean;
    };
    post?: {
        url: string;
        content?: string;
        reactionSummary: { total: number };
        reactions: ReactionUser[];
    };
    comments?: ScrapedComment[];
    profile?: ProfileData;
    artifacts?: {
        screenshots?: ScreenshotArtifact[];
        engagementJson?: LocalFileArtifact;
        sessionVideo?: LocalFileArtifact;
        sourceVideo?: LocalFileArtifact;
        selfHealing?: SelfHealingArtifact[];
        blockedPage?: {
            finalUrl: string;
            screenshot?: LocalFileArtifact;
            html?: LocalFileArtifact;
        };
    };
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
        browserSession: BrowserSessionMode;
        workers?: number;
        workerConcurrency?: number;
    };
    summary: {
        succeeded: number;
        partial: number;
        failed: number;
    };
    artifacts: { video: VideoArtifact };
    results: ScrapeItemOutput[];
};
