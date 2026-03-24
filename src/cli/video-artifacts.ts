import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { log } from '../common/logger.js';
import type { VideoArtifact } from '../facebook/output-item.js';
import type { RunCliOptions } from './types.js';

const ensureParentDirectory = async (filePath: string): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true });
};

const resolveVideoTargetPath = async (options: RunCliOptions, runId: string): Promise<string | undefined> => {
    if (!options.screenVideo) return undefined;
    const videoFileName = `${runId}.webm`;
    if (options.outputFile) {
        await ensureParentDirectory(options.outputFile);
        return join(dirname(options.outputFile), videoFileName);
    }

    const artifactDir = join(options.artifactRootDir, runId);
    await mkdir(artifactDir, { recursive: true });
    return join(artifactDir, videoFileName);
};

export const finalizeVideoArtifact = async (
    options: RunCliOptions,
    runId: string,
    rawVideoPaths: string[],
): Promise<VideoArtifact> => {
    if (!options.screenVideo || rawVideoPaths.length === 0) return { present: false };
    const uniquePaths = [...new Set(rawVideoPaths)];
    let rawVideoPath = uniquePaths[0];
    if (uniquePaths.length > 1) {
        const sizedVideos = await Promise.all(uniquePaths.map(async (path) => ({ path, size: (await stat(path).catch(() => undefined))?.size ?? -1 })));
        sizedVideos.sort((left, right) => right.size - left.size);
        rawVideoPath = sizedVideos[0]?.path ?? uniquePaths[0];
        await Promise.all(uniquePaths.filter((path) => path !== rawVideoPath).map(async (path) => unlink(path).catch(() => undefined)));
        log.warning(`Multiple browser videos detected (${String(uniquePaths.length)}). Kept the largest one.`);
    }

    const targetPath = await resolveVideoTargetPath(options, runId);
    if (!targetPath || rawVideoPath === targetPath) return { present: true, localPath: rawVideoPath };

    try {
        await rename(rawVideoPath, targetPath);
        return { present: true, localPath: targetPath };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warning(`Could not move Playwright video to ${targetPath}: ${message}`);
        return { present: true, localPath: rawVideoPath };
    }
};
