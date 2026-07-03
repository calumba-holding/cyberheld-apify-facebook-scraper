import { randomUUID } from 'node:crypto';

import type { Page } from 'playwright';

import { log } from '../common/logger.js';
import type { ScrapedComment } from '../common/types.js';
import { runPostEngagementScrapeOnPage } from '../facebook/plugin.js';
import { facebookPlugin } from '../facebook/plugin.js';
import { cleanupChromeProfileLocks } from './chrome-profile.js';
import { focusChromeOnDisplay } from './focus-display.js';
import type { CommentDetectionMethod } from './types.js';

export interface PollResult {
    comments: ScrapedComment[];
    method: CommentDetectionMethod;
    sessionOk: boolean;
    error?: string;
}

export interface WatchPollerOptions {
    profileRootDir: string;
    artifactRootDir: string;
    chromeExecutable: string;
    waitAfterNavigationMs?: number;
    requestTimeoutSecs?: number;
    commentsOnly?: boolean;
}

export type WatchPoller = {
    pollPostComments: (postUrl: string) => Promise<PollResult>;
    close: () => Promise<void>;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const launchWatchBrowser = async (options: WatchPollerOptions) => {
    const launchOptions = {
        browserSessionMode: 'persistent-profile' as const,
        chromeExecutable: options.chromeExecutable,
        profileRootDir: options.profileRootDir,
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) await cleanupChromeProfileLocks(options.profileRootDir);
        else await cleanupChromeProfileLocks(options.profileRootDir, { killChrome: false });

        const context = await facebookPlugin.launchBrowser(launchOptions);
        try {
            await sleep(1500);
            const page = context.pages().find((p) => !p.isClosed()) ?? await context.newPage();
            if (!context.browser()?.isConnected()) {
                throw new Error('Chrome disconnected immediately after launch');
            }
            return { context, page };
        } catch (error) {
            lastError = error;
            log.error(`Chrome launch attempt ${String(attempt)}/3 failed: ${error instanceof Error ? error.message : String(error)}`);
            await context.close().catch(() => undefined);
            await cleanupChromeProfileLocks(options.profileRootDir);
            await sleep(1000);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

export const createWatchPoller = async (options: WatchPollerOptions): Promise<WatchPoller> => {
    const { context, page: workerPage } = await launchWatchBrowser(options);
    await focusChromeOnDisplay();
    process.stderr.write('Chrome is running on the virtual display — check noVNC now.\n');

    const waitAfterNavigationMs = options.waitAfterNavigationMs ?? 4000;
    const requestTimeoutSecs = options.requestTimeoutSecs ?? 240;

    const ensurePage = async (): Promise<Page> => {
        if (!workerPage.isClosed() && context.browser()?.isConnected()) return workerPage;
        throw new Error('Chrome closed unexpectedly — restart watch');
    };

    return {
        pollPostComments: async (postUrl: string): Promise<PollResult> => {
            const runId = randomUUID();
            try {
                log.info(`Polling comments: ${postUrl}`);
                await focusChromeOnDisplay();
                const page = await ensurePage();
                const result = await runPostEngagementScrapeOnPage(page, postUrl, {
                    runId,
                    itemIndex: 0,
                    artifactRootDir: options.artifactRootDir,
                    browserSessionMode: 'persistent-profile',
                    chromeExecutable: options.chromeExecutable,
                    profileRootDir: options.profileRootDir,
                    waitAfterNavigationMs,
                    requestTimeoutSecs,
                    screenVideo: false,
                    download: false,
                    regenerateScript: false,
                    commentsOnly: options.commentsOnly ?? true,
                });

                if (result.kind !== 'engagement') {
                    return {
                        comments: [],
                        method: 'engagement_scrape',
                        sessionOk: true,
                        error: `Unexpected scrape result kind: ${result.kind}`,
                    };
                }

                log.info(`Poll returned ${String(result.comments.length)} comments.`);
                return {
                    comments: result.comments,
                    method: 'engagement_scrape',
                    sessionOk: true,
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log.error(`Poll failed for ${postUrl}: ${message}`);
                return {
                    comments: [],
                    method: 'engagement_scrape',
                    sessionOk: false,
                    error: message,
                };
            }
        },
        close: async (): Promise<void> => {
            await context.close().catch(() => undefined);
        },
    };
};
