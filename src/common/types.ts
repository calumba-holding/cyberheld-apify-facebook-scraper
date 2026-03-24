import type { BrowserContext } from 'playwright';

export type SupportedTarget = 'facebook';

export interface RunScrapeOptions {
    waitAfterNavigationMs: number;
    requestTimeoutSecs: number;
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

export interface TargetPlugin<TResult extends BaseScrapeResult = BaseScrapeResult> {
    target: SupportedTarget;
    scrapers: readonly string[];
    getProfileDir: (profileRootDir?: string) => string;
    launchPersistentBrowser: (options: LaunchBrowserOptions) => Promise<BrowserContext>;
    openProfileLoginBrowser: (options: ProfileLoginOptions) => Promise<BrowserContext>;
    runScrape: (context: BrowserContext, scraper: string, targetUrl: string, options: RunScrapeOptions) => Promise<TResult>;
}
