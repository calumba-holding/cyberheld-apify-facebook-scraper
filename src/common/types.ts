import type { BrowserContext } from 'playwright';

export type SupportedTarget = 'facebook' | 'instagram';
export type BrowserSessionMode = 'persistent-profile' | 'public-session' | 'guest-session';

export interface RunScrapeOptions {
    runId: string;
    itemIndex: number;
    outputFile?: string;
    artifactRootDir: string;
    browserSessionMode: BrowserSessionMode;
    chromeExecutable: string;
    profileRootDir: string;
    waitAfterNavigationMs: number;
    requestTimeoutSecs: number;
    screenVideo?: boolean;
    download?: boolean;
    regenerateScript?: boolean;
}

export interface ProfileLoginOptions {
    chromeExecutable: string;
    profileRootDir: string;
}

export interface LaunchBrowserOptions {
    browserSessionMode: BrowserSessionMode;
    chromeExecutable: string;
    profileRootDir: string;
    recordVideoDir?: string;
}

export interface BaseScrapeResult {
    inputUrl: string;
    finalUrl: string;
    scrapedAt: string;
    status?: 'SUCCEEDED' | 'PARTIAL';
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

export interface LocalFileArtifact {
    localPath: string;
}

export type SelfHealingAction = 'generate' | 'repair';
export type SelfHealingStatus = 'saved' | 'failed';

export interface SelfHealingArtifact {
    action: SelfHealingAction;
    status: SelfHealingStatus;
    screenshot?: LocalFileArtifact;
    html?: LocalFileArtifact;
}

export interface BlockedPageArtifact {
    finalUrl: string;
    screenshot?: LocalFileArtifact;
    html?: LocalFileArtifact;
}

export type ScreenshotArtifact = LocalFileArtifact;

export interface EngagementScrapeResult extends BaseScrapeResult {
    kind: 'engagement';
    reactionCount: number;
    commentCount: number;
    commentsComplete?: boolean;
    postReactionsComplete?: boolean;
    commentVisibilityComplete?: boolean;
    postContent?: string;
    reactions: ReactionUser[];
    comments: ScrapedComment[];
    sourceVideo?: LocalFileArtifact;
    selfHealing?: SelfHealingArtifact[];
}

export interface ProfileCounts {
    posts?: number;
    followers?: number;
    following?: number;
}

export interface ProfileIndicators {
    verified: boolean;
    private: boolean;
}

export interface ProfileData {
    url: string;
    username?: string;
    displayName?: string;
    bio?: string;
    profilePictureUrl?: string;
    externalLinks: string[];
    counts: ProfileCounts;
    indicators: ProfileIndicators;
}

export interface ProfileScrapeResult extends BaseScrapeResult {
    kind: 'profile';
    profile: ProfileData;
    screenshots: ScreenshotArtifact[];
}

export type ScrapeResult = EngagementScrapeResult | ProfileScrapeResult;

export interface TargetPlugin<TResult extends BaseScrapeResult = ScrapeResult> {
    target: SupportedTarget;
    scrapers: readonly string[];
    getProfileDir: (profileRootDir?: string, browserSessionMode?: BrowserSessionMode) => string;
    launchBrowser: (options: LaunchBrowserOptions) => Promise<BrowserContext>;
    openProfileLoginBrowser: (options: ProfileLoginOptions) => Promise<BrowserContext>;
    runScrape: (context: BrowserContext, scraper: string, targetUrl: string, options: RunScrapeOptions) => Promise<TResult>;
}
