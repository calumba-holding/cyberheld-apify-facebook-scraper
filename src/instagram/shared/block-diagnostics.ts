import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Page } from 'playwright';

import { captureScreenshot, resolveScreenshotPath } from '../../common/screenshot-artifacts.js';
import type { BlockedPageArtifact, RunScrapeOptions } from '../../common/types.js';

export const captureInstagramBlockedPageArtifact = async (
    page: Page,
    finalUrl: string,
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
): Promise<BlockedPageArtifact> => {
    const screenshot = await captureScreenshot(page, {
        ...options,
        label: 'blocked-page',
        variant: 'full',
    }).catch(() => undefined);

    const htmlPath = resolveScreenshotPath({ ...options, label: 'blocked-page', variant: 'full' }).replace(/\.png$/, '.html');
    const html = await page.content().catch(() => undefined);
    if (html !== undefined) {
        await mkdir(dirname(htmlPath), { recursive: true }).catch(() => undefined);
        await writeFile(htmlPath, html, 'utf8').catch(() => undefined);
    }

    return {
        finalUrl,
        screenshot,
        html: html !== undefined ? { localPath: htmlPath } : undefined,
    };
};
