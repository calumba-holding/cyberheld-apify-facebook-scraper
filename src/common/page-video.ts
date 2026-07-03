import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Page } from 'playwright';

import { log } from './logger.js';
import type { LocalFileArtifact, RunScrapeOptions } from './types.js';

export const resolveItemVideoPath = (
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
): string => {
    const fileName = `${options.runId}_session-${String(options.itemIndex + 1).padStart(2, '0')}.webm`;
    if (options.outputFile) return join(dirname(options.outputFile), fileName);
    return join(options.artifactRootDir, options.runId, fileName);
};

export const persistPageVideo = async (
    page: Page,
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
): Promise<LocalFileArtifact | undefined> => {
    const recording = page.video();
    if (!recording) return undefined;

    const rawPath = await recording.path().catch(() => undefined);
    if (!rawPath) return undefined;

    const targetPath = resolveItemVideoPath(options);
    await mkdir(dirname(targetPath), { recursive: true });

    try {
        await copyFile(rawPath, targetPath);
        await unlink(rawPath).catch(() => undefined);
        return { localPath: targetPath };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warning(`Could not persist page video to ${targetPath}: ${message}`);
        return { localPath: rawPath };
    }
};
