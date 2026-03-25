import { copyFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { log } from '../common/logger.js';
import type { VideoArtifact } from '../facebook/output-item.js';
import type { RunCliOptions } from './types.js';

const ensureParentDirectory = async (filePath: string): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true });
};

const resolveRunArtifactDir = async (options: RunCliOptions, runId: string): Promise<string> => {
    const artifactDir = join(options.artifactRootDir, runId);
    await mkdir(artifactDir, { recursive: true });
    return artifactDir;
};

const resolveVideoTargetPath = async (options: RunCliOptions, runId: string): Promise<string | undefined> => {
    if (!options.screenVideo) return undefined;
    const videoFileName = `${runId}.webm`;
    if (options.outputFile) return join(dirname(options.outputFile), videoFileName);
    return join(await resolveRunArtifactDir(options, runId), videoFileName);
};

const hasPresentVideoFile = async (filePath: string): Promise<boolean> => {
    return ((await stat(filePath).catch(() => undefined))?.size ?? 0) > 0;
};

export const prepareRawVideoDir = async (options: RunCliOptions, runId: string): Promise<string | undefined> => {
    if (!options.screenVideo) return undefined;
    const rawVideoDir = join(await resolveRunArtifactDir(options, runId), 'playwright-video-raw');
    await mkdir(rawVideoDir, { recursive: true });
    return rawVideoDir;
};

export const finalizeVideoArtifact = async (
    options: RunCliOptions,
    runId: string,
    rawVideoDir: string | undefined,
    keepFinalVideo: boolean,
): Promise<VideoArtifact> => {
    if (!options.screenVideo || !rawVideoDir) return { present: false };

    const rawVideoEntries = await readdir(rawVideoDir, { withFileTypes: true }).catch(() => []);
    const rawVideos = await Promise.all(rawVideoEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.webm'))
        .map(async (entry) => {
            const path = join(rawVideoDir, entry.name);
            return { path, size: (await stat(path).catch(() => undefined))?.size ?? 0 };
        }));
    const validVideos = rawVideos
        .filter((video) => video.size > 0)
        .sort((left, right) => right.size - left.size);
    const chosenVideo = keepFinalVideo ? validVideos[0] : undefined;

    await Promise.all(rawVideos
        .filter((video) => video.path !== chosenVideo?.path)
        .map(async (video) => unlink(video.path).catch(() => undefined)));

    if (!keepFinalVideo || !chosenVideo) return { present: false };
    if (validVideos.length > 1) {
        log.warning(`Multiple browser videos detected (${String(validVideos.length)}). Kept the largest one.`);
    }

    const targetPath = await resolveVideoTargetPath(options, runId);
    if (!targetPath) {
        await unlink(chosenVideo.path).catch(() => undefined);
        return { present: false };
    }

    await ensureParentDirectory(targetPath);
    try {
        await rename(chosenVideo.path, targetPath);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warning(`Could not move Playwright video to ${targetPath}: ${message}`);

        try {
            await copyFile(chosenVideo.path, targetPath);
            await unlink(chosenVideo.path).catch(() => undefined);
        } catch (copyError) {
            const copyMessage = copyError instanceof Error ? copyError.message : String(copyError);
            log.warning(`Could not copy Playwright video to ${targetPath}: ${copyMessage}`);
            return { present: false };
        }
    }

    if (await hasPresentVideoFile(targetPath)) return { present: true, localPath: targetPath };
    await unlink(targetPath).catch(() => undefined);
    return { present: false };
};
