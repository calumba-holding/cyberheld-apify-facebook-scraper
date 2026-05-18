import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Page } from 'playwright';

import type {
    LocalFileArtifact,
    RunScrapeOptions,
    SelfHealingAction,
    SelfHealingArtifact,
    SelfHealingStatus,
} from '../common/types.js';

export type SelfHealingArtifactOptions = Pick<
    RunScrapeOptions,
    'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'
>;

const resolveSelfHealingBasePath = async (
    options: SelfHealingArtifactOptions,
    action: SelfHealingAction,
    attempt: number,
): Promise<string> => {
    const item = `item-${String(options.itemIndex + 1)}`;
    const name = `${item}_self-healing-${String(attempt)}-${action}`;
    if (options.outputFile) {
        const basePath = join(dirname(options.outputFile), `${options.runId}_${name}`);
        await mkdir(dirname(basePath), { recursive: true });
        return basePath;
    }

    const basePath = join(options.artifactRootDir, options.runId, 'self-healing', name);
    await mkdir(dirname(basePath), { recursive: true });
    return basePath;
};

const writeScreenshot = async (page: Page, path: string): Promise<LocalFileArtifact | undefined> => {
    try {
        await page.screenshot({ path, fullPage: true });
        return { localPath: path };
    } catch {
        return undefined;
    }
};

const writeHtml = async (path: string, snapshot: string): Promise<LocalFileArtifact | undefined> => {
    try {
        await writeFile(path, snapshot, 'utf8');
        return { localPath: path };
    } catch {
        return undefined;
    }
};

export const captureSelfHealingArtifact = async (
    page: Page,
    snapshot: string,
    options: SelfHealingArtifactOptions,
    action: SelfHealingAction,
    status: SelfHealingStatus,
    attempt: number,
): Promise<SelfHealingArtifact> => {
    try {
        const basePath = await resolveSelfHealingBasePath(options, action, attempt);
        const [screenshot, html] = await Promise.all([
            writeScreenshot(page, `${basePath}.png`),
            writeHtml(`${basePath}.html`, snapshot),
        ]);
        return { action, status, screenshot, html };
    } catch {
        return { action, status };
    }
};
