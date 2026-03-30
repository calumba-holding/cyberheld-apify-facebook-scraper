import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Page } from 'playwright';

import type { RunScrapeOptions, ScreenshotArtifact } from '../../../common/types.js';

const ensureParentDirectory = async (filePath: string): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true });
};

const resolveScreenshotPath = (options: RunScrapeOptions): string => {
    const fileName = `${options.runId}_profile-${String(options.itemIndex + 1).padStart(2, '0')}.png`;
    if (options.outputFile) return join(dirname(options.outputFile), fileName);
    return join(options.artifactRootDir, options.runId, 'screenshots', fileName);
};

export const captureInstagramProfileScreenshot = async (
    page: Page,
    options: RunScrapeOptions,
): Promise<ScreenshotArtifact | undefined> => {
    const screenshotPath = resolveScreenshotPath(options);
    await ensureParentDirectory(screenshotPath);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return { localPath: screenshotPath };
};
