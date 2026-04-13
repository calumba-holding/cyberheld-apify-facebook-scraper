import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Page } from 'playwright';

import type { BlockedPageArtifact, RunScrapeOptions } from '../../common/types.js';

const resolveBlockedPageBasePath = async (
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
): Promise<string> => {
    if (options.outputFile) {
        const basePath = join(dirname(options.outputFile), `${options.runId}_item-${String(options.itemIndex + 1)}_blocked-page`);
        await mkdir(dirname(basePath), { recursive: true });
        return basePath;
    }

    const basePath = join(options.artifactRootDir, options.runId, 'blocked-page', `item-${String(options.itemIndex + 1)}_blocked-page`);
    await mkdir(dirname(basePath), { recursive: true });
    return basePath;
};

export const captureFacebookBlockedPageArtifact = async (
    page: Page,
    finalUrl: string,
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
): Promise<BlockedPageArtifact> => {
    const basePath = await resolveBlockedPageBasePath(options);
    const screenshotPath = `${basePath}.png`;
    const htmlPath = `${basePath}.html`;

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    const html = await page.content().catch(() => undefined);
    if (html !== undefined) await writeFile(htmlPath, html, 'utf8').catch(() => undefined);

    return {
        finalUrl,
        screenshot: { localPath: screenshotPath },
        html: html !== undefined ? { localPath: htmlPath } : undefined,
    };
};
