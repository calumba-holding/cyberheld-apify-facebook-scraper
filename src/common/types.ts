import type { BrowserContext } from 'playwright';

export type SupportedTarget = 'facebook' | 'instagram';

export interface RunScrapeOptions {
    waitAfterNavigationMs: number;
    requestTimeoutSecs: number;
    screenVideo?: boolean;
}

export interface ProfileLoginOptions {
    chromeExecutable: string;
    profileRootDir: string;
}

export interface LaunchBrowserOptions {
    chromeExecutable: string;
    profileRootDir: string;
    recordVideoDir?: string;
}

export interface BaseScrapeResult {
    inputUrl: string;
    finalUrl: string;
    scrapedAt: string;
}

export interface ReactionUser {
    name: string;
    profile_url: string;
    reaction: string;
}

export interface CommentReactionUser {
    name: string;
    profile_url: string;
    reaction: string;
}

export interface CommentReactionBreakdown {
    reaction: string;
    count: number;
}

export interface CommentReactionDetails {
    count: number;
    label: string;
    breakdown: CommentReactionBreakdown[];
    users: CommentReactionUser[];
}

export interface ScrapedComment {
    user: string;
    content: string;
    timestamp: string;
    timestampLabel?: string;
    id: string;
    reactions?: CommentReactionDetails;
}

export interface EngagementScrapeResult extends BaseScrapeResult {
    reactionCount: number;
    commentCount: number;
    commentsComplete?: boolean;
    postReactionsComplete?: boolean;
    commentVisibilityComplete?: boolean;
    postContent?: string;
    reactions: ReactionUser[];
    comments: ScrapedComment[];
    status?: 'SUCCEEDED' | 'PARTIAL';
}

export interface TargetPlugin<TResult extends BaseScrapeResult = EngagementScrapeResult> {
    target: SupportedTarget;
    scrapers: readonly string[];
    getProfileDir: (profileRootDir?: string) => string;
    launchPersistentBrowser: (options: LaunchBrowserOptions) => Promise<BrowserContext>;
    openProfileLoginBrowser: (options: ProfileLoginOptions) => Promise<BrowserContext>;
    runScrape: (context: BrowserContext, scraper: string, targetUrl: string, options: RunScrapeOptions) => Promise<TResult>;
}
