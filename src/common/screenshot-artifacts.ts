import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Locator, Page } from 'playwright';

import type { RunScrapeOptions, ScreenshotArtifact } from './types.js';

export type ScreenshotCaptureOptions = Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'> & {
    label: string;
    variant?: 'viewport' | 'full';
    timeoutMs?: number;
};

const ensureParentDirectory = async (filePath: string): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true });
};

export const resolveScreenshotPath = (options: ScreenshotCaptureOptions): string => {
    const variantSuffix = options.variant === 'full' ? '_full' : '';
    const fileName = `${options.runId}_${options.label}-${String(options.itemIndex + 1).padStart(2, '0')}${variantSuffix}.png`;
    if (options.outputFile) return join(dirname(options.outputFile), fileName);
    return join(options.artifactRootDir, options.runId, 'screenshots', fileName);
};

const SCREENSHOT_TIMEOUT_MS = 15_000;

export const captureScreenshot = async (
    page: Page,
    options: ScreenshotCaptureOptions,
): Promise<ScreenshotArtifact> => {
    const screenshotPath = resolveScreenshotPath(options);
    await ensureParentDirectory(screenshotPath);
    await page.screenshot({
        path: screenshotPath,
        fullPage: options.variant === 'full',
        timeout: options.timeoutMs ?? SCREENSHOT_TIMEOUT_MS,
    });
    return { localPath: screenshotPath };
};

export const captureLocatorScreenshot = async (
    locator: Locator,
    options: ScreenshotCaptureOptions,
): Promise<ScreenshotArtifact> => {
    const screenshotPath = resolveScreenshotPath(options);
    await ensureParentDirectory(screenshotPath);
    const timeout = options.timeoutMs ?? SCREENSHOT_TIMEOUT_MS;
    const box = await locator.boundingBox().catch(() => null);

    if (box && box.height > 1_200) {
        const page = locator.page();
        await page.screenshot({
            path: screenshotPath,
            clip: {
                x: Math.max(0, box.x),
                y: Math.max(0, box.y),
                width: Math.min(box.width, 1_280),
                height: Math.min(box.height, 1_200),
            },
            timeout,
        });
        return { localPath: screenshotPath };
    }

    await locator.screenshot({ path: screenshotPath, timeout });
    return { localPath: screenshotPath };
};
