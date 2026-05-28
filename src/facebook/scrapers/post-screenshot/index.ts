import type { Page } from 'playwright';

import { captureScreenshot } from '../../../common/screenshot-artifacts.js';
import type { RunScrapeOptions, ScreenshotArtifact, ScreenshotScrapeResult } from '../../../common/types.js';

export const POST_SCREENSHOT_SCRAPER = 'post-screenshot';

const waitForPostSurface = async (page: Page, timeoutMs: number): Promise<void> => {
    await page.waitForLoadState('domcontentloaded');
    await Promise.race([
        page.locator('[role="article"]').first().waitFor({ state: 'visible', timeout: timeoutMs }),
        page.locator('[role="main"]').first().waitFor({ state: 'visible', timeout: timeoutMs }),
    ]).catch(() => undefined);
};

const readPostPreview = async (page: Page): Promise<string | undefined> => {
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => null);
    if (ogDescription?.trim()) return ogDescription.trim();

    const title = await page.title().catch(() => '');
    return title.trim() || undefined;
};

export const scrapePostScreenshot = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    options: RunScrapeOptions,
): Promise<ScreenshotScrapeResult> => {
    await waitForPostSurface(page, Math.min(options.requestTimeoutSecs * 1000, 30_000));
    await page.waitForTimeout(options.waitAfterNavigationMs);

    const screenshots: ScreenshotArtifact[] = [];
    screenshots.push(await captureScreenshot(page, {
        artifactRootDir: options.artifactRootDir,
        itemIndex: options.itemIndex,
        outputFile: options.outputFile,
        runId: options.runId,
        label: 'post',
        variant: 'viewport',
    }));

    if (options.fullPageScreenshot) {
        screenshots.push(await captureScreenshot(page, {
            artifactRootDir: options.artifactRootDir,
            itemIndex: options.itemIndex,
            outputFile: options.outputFile,
            runId: options.runId,
            label: 'post',
            variant: 'full',
        }));
    }

    return {
        kind: 'screenshot',
        inputUrl,
        finalUrl,
        scrapedAt: new Date().toISOString(),
        screenshots,
        status: screenshots.length > 0 ? 'SUCCEEDED' : 'PARTIAL',
        captionPreview: await readPostPreview(page),
    };
};
