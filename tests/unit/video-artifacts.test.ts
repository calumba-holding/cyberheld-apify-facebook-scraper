import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { finalizeVideoArtifact, prepareRawVideoDir } from '../../src/cli/video-artifacts.js';
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
    await Promise.all(tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe('video artifacts', () => {
    it('uses a dedicated per-run raw video dir and keeps one valid final webm', async () => {
        const rootDir = await createTempDir();
        const outputFile = join(rootDir, 'output', 'result.json');
        const options = createRunOptions(rootDir, outputFile);
        const runId = 'run-123';
        const rawVideoDir = await prepareRawVideoDir(options, runId);

        expect(rawVideoDir).toBeDefined();
        expect(rawVideoDir).not.toBe(dirname(outputFile));
        expect(rawVideoDir).toBe(join(options.artifactRootDir, runId, 'playwright-video-raw'));

        await writeFile(join(rawVideoDir!, 'zero.webm'), '');
        await writeFile(join(rawVideoDir!, 'small.webm'), 'small');
        await writeFile(join(rawVideoDir!, 'large.webm'), 'this is the larger webm payload');

        const artifact = await finalizeVideoArtifact(options, runId, rawVideoDir, true);

        expect(artifact.present).toBe(true);
        expect(artifact.localPath).toBe(join(dirname(outputFile), `${runId}.webm`));
        await expect(readFile(artifact.localPath!, 'utf8')).resolves.toBe('this is the larger webm payload');
        await expect(stat(artifact.localPath!)).resolves.toMatchObject({ size: 'this is the larger webm payload'.length });
        await expect(readdir(rawVideoDir!)).resolves.toEqual([]);
    });

    it('deletes ghost webms and reports no artifact when every scrape failed', async () => {
        const rootDir = await createTempDir();
        const options = createRunOptions(rootDir);
        const runId = 'run-456';
        const rawVideoDir = await prepareRawVideoDir(options, runId);

        await writeFile(join(rawVideoDir!, 'ghost.webm'), 'ghost video');

        const artifact = await finalizeVideoArtifact(options, runId, rawVideoDir, false);

        expect(artifact).toEqual({ present: false });
        await expect(readdir(rawVideoDir!)).resolves.toEqual([]);
        await expect(stat(join(options.artifactRootDir, runId, `${runId}.webm`))).rejects.toThrow();
    });

    it('reports no artifact for zero-byte webms', async () => {
        const rootDir = await createTempDir();
        const options = createRunOptions(rootDir);
        const runId = 'run-789';
        const rawVideoDir = await prepareRawVideoDir(options, runId);

        await writeFile(join(rawVideoDir!, 'empty.webm'), '');

        const artifact = await finalizeVideoArtifact(options, runId, rawVideoDir, true);

        expect(artifact).toEqual({ present: false });
        await expect(readdir(rawVideoDir!)).resolves.toEqual([]);
    });
});
