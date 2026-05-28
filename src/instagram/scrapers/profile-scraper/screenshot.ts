import type { Page } from 'playwright';

import { captureScreenshot } from '../../../common/screenshot-artifacts.js';
import type { RunScrapeOptions, ScreenshotArtifact } from '../../../common/types.js';

export const captureInstagramProfileScreenshot = async (
    page: Page,
    options: RunScrapeOptions,
): Promise<ScreenshotArtifact | undefined> => {
    return captureScreenshot(page, {
        artifactRootDir: options.artifactRootDir,
        itemIndex: options.itemIndex,
        outputFile: options.outputFile,
        runId: options.runId,
        label: 'profile',
        variant: 'full',
    }).catch(() => undefined);
};
