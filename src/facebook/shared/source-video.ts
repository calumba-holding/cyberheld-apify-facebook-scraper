import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { log } from '../../common/logger.js';
import type { LocalFileArtifact, RunScrapeOptions } from '../../common/types.js';
import { extractFacebookVideoId } from './url.js';

export interface FacebookSourceVideoDownload {
    promise: Promise<LocalFileArtifact | undefined>;
    cancel: () => Promise<void>;
}

const hasPresentFile = async (filePath: string): Promise<boolean> => {
    return ((await stat(filePath).catch(() => undefined))?.size ?? 0) > 0;
};

const resolveSourceVideoTargetPath = async (
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
    videoId: string,
): Promise<string> => {
    if (options.outputFile) {
        const filePath = join(dirname(options.outputFile), `${options.runId}_item-${String(options.itemIndex + 1)}_video-${videoId}.mp4`);
        await mkdir(dirname(filePath), { recursive: true });
        return filePath;
    }

    const filePath = join(options.artifactRootDir, options.runId, 'source-video', `item-${String(options.itemIndex + 1)}_video-${videoId}.mp4`);
    await mkdir(dirname(filePath), { recursive: true });
    return filePath;
};

const waitForChildClose = async (child: ChildProcess, timeoutMs: number): Promise<boolean> => {
    if (child.exitCode !== null) return true;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            cleanup();
            resolve(false);
        }, timeoutMs);

        const handleClose = (): void => {
            cleanup();
            resolve(true);
        };

        const cleanup = (): void => {
            clearTimeout(timer);
            child.off('close', handleClose);
        };

        child.once('close', handleClose);
    });
};

const waitForProcess = (child: ChildProcess, targetPath: string): Promise<LocalFileArtifact | undefined> => {
    return new Promise((resolve) => {
        let settled = false;
        let stderr = '';

        const finish = (artifact: LocalFileArtifact | undefined): void => {
            if (settled) return;
            settled = true;
            resolve(artifact);
        };

        child.stderr?.on('data', (chunk: Buffer | string) => {
            stderr = `${stderr}${typeof chunk === 'string' ? chunk : chunk.toString('utf8')}`.slice(-4000);
        });

        child.once('error', (error) => {
            log.warning(`Could not start yt-dlp source-video download: ${error.message}`);
            finish(undefined);
        });

        child.once('close', (code) => {
            void (async () => {
                if (code === 0 && await hasPresentFile(targetPath)) {
                    finish({ localPath: targetPath });
                    return;
                }

                if (await hasPresentFile(targetPath)) await unlink(targetPath).catch(() => undefined);
                const details = stderr.trim().split('\n').slice(-3).join(' ').trim();
                log.warning(details
                    ? `Facebook source-video download failed (${String(code)}): ${details}`
                    : `Facebook source-video download failed with exit code ${String(code)}.`);
                finish(undefined);
            })();
        });
    });
};

export const startFacebookSourceVideoDownload = async (
    finalUrl: string,
    profileDir: string,
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
): Promise<FacebookSourceVideoDownload | null> => {
    const videoId = extractFacebookVideoId(finalUrl);
    if (!videoId) return null;

    const targetPath = await resolveSourceVideoTargetPath(options, videoId);
    log.info(`Starting Facebook source-video download for video ${videoId}.`);

    const child = spawn('yt-dlp', [
        '--no-warnings',
        '--no-progress',
        '--no-part',
        '--no-playlist',
        '--force-overwrites',
        '--merge-output-format',
        'mp4',
        '-f',
        'bv*+ba/b',
        '--cookies-from-browser',
        `chrome:${profileDir}`,
        '-o',
        targetPath,
        finalUrl,
    ], {
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    const download = waitForProcess(child, targetPath);

    return {
        promise: download,
        cancel: async () => {
            if (child.exitCode === null && !child.killed) {
                child.kill('SIGTERM');
                const closedAfterTerm = await waitForChildClose(child, 3000);
                if (!closedAfterTerm && child.exitCode === null) {
                    child.kill('SIGKILL');
                    await waitForChildClose(child, 3000);
                }
            }

            await download;
            await unlink(targetPath).catch(() => undefined);
        },
    };
};
