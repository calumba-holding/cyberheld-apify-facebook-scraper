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
    fullPageScreenshot?: boolean;
    expandComments?: boolean;
    /** Watch mode: skip post-reaction extraction (much faster polls). */
    commentsOnly?: boolean;
    /** Profile scraper: maximum number of recent posts to collect. */
    maxPosts?: number;
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
    /** Parent comment id when this row is a nested reply under "View replies". */
    parentId?: string;
    /** True when the DOM row lives under a reply thread container. */
    isReply?: boolean;
    /** Visible like count on the comment row, e.g. "37" from "37 likes". */
    likeCount?: string;
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
    overview?: unknown;
    tabs?: Record<string, unknown>;
    moreSections?: Record<string, unknown>;
    recentPosts?: unknown[];
    requestedPostCount?: number;
    extractedPostCount?: number;
    errors?: string[];
}

export interface ProfileScrapeResult extends BaseScrapeResult {
    kind: 'profile';
    profile: ProfileData;
    screenshots: ScreenshotArtifact[];
}

export interface ScreenshotEngagementLabels {
    likes?: string;
    comments?: string;
    reposts?: string;
}

export interface ScreenshotScrapeResult extends BaseScrapeResult {
    kind: 'screenshot';
    screenshots: ScreenshotArtifact[];
    captionPreview?: string;
    engagementLabels?: ScreenshotEngagementLabels;
    commentsExpanded?: boolean;
    reactionCount?: number;
    commentCount?: number;
    postContent?: string;
    reactions?: ReactionUser[];
    comments?: ScrapedComment[];
    commentsComplete?: boolean;
    postReactionsComplete?: boolean;
    engagementJsonPath?: string;
    sessionVideo?: LocalFileArtifact;
}

export type ScrapeResult = EngagementScrapeResult | ProfileScrapeResult | ScreenshotScrapeResult;

export interface TargetPlugin<TResult extends BaseScrapeResult = ScrapeResult> {
    target: SupportedTarget;
    scrapers: readonly string[];
    getProfileDir: (profileRootDir?: string, browserSessionMode?: BrowserSessionMode) => string;
    launchBrowser: (options: LaunchBrowserOptions) => Promise<BrowserContext>;
    openProfileLoginBrowser: (options: ProfileLoginOptions) => Promise<BrowserContext>;
    runScrape: (context: BrowserContext, scraper: string, targetUrl: string, options: RunScrapeOptions) => Promise<TResult>;
}
