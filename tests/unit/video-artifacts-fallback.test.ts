import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RunCliOptions } from '../../src/cli/types.js';

const tempDirs: string[] = [];

const createRunOptions = (rootDir: string, outputFile?: string): RunCliOptions => ({
    command: 'run',
    target: 'facebook',
    scraper: 'post-engagement',
    targetUrls: ['https://www.facebook.com/example/posts/123'],
    concurrency: 1,
    screenVideo: true,
    outputFile,
    chromeExecutable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    profileRootDir: join(rootDir, 'profiles'),
    waitAfterNavigationMs: 5000,
    requestTimeoutSecs: 240,
    verbose: false,
    artifactRootDir: join(rootDir, 'artifacts'),
});

const createTempDir = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), 'cyberheld-scraper-cli-'));
    tempDirs.push(dir);
    return dir;
};

afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
    await Promise.all(tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe('video artifact finalization fallback', () => {
    it('copies the chosen video to the final target when rename fails', async () => {
        vi.doMock('node:fs/promises', async () => {
            const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
            return {
                ...actual,
                rename: async () => {
                    const error = new Error('Cross-device link not permitted');
                    Object.assign(error, { code: 'EXDEV' });
                    throw error;
                },
            };
        });

        const { finalizeVideoArtifact, prepareRawVideoDir } = await import('../../src/cli/video-artifacts.js');
        const rootDir = await createTempDir();
        const outputFile = join(rootDir, 'output', 'result.json');
        const options = createRunOptions(rootDir, outputFile);
        const runId = 'run-copy-fallback';
        const rawVideoDir = await prepareRawVideoDir(options, runId);

        await writeFile(join(rawVideoDir!, 'candidate.webm'), 'copy me');

        const artifact = await finalizeVideoArtifact(options, runId, rawVideoDir, true);

        expect(artifact).toEqual({
            present: true,
            localPath: join(dirname(outputFile), `${runId}.webm`),
        });
        await expect(readFile(artifact.localPath!, 'utf8')).resolves.toBe('copy me');
        await expect(readdir(rawVideoDir!)).resolves.toEqual([]);
    });
});
