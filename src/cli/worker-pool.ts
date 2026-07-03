import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { log } from '../common/logger.js';
import { buildFailedOutput, buildRunOutput } from '../common/output-item.js';
import type { ScrapeItemOutput, ScrapeRunOutput, VideoArtifact } from '../common/output-types.js';
import { getTargetPlugin } from '../registry.js';
import { sleep } from './retry.js';
import type { RunCliOptions } from './types.js';

const childModulePath = join(dirname(fileURLToPath(import.meta.url)), 'worker-pool-child.js');

/** Persistent-profile and public-session Chrome profiles lock their directory; guest sessions use unique temp dirs already. */
const needsPerWorkerProfileDir = (options: RunCliOptions): boolean => (
    options.browserSessionMode === 'persistent-profile' || options.browserSessionMode === 'public-session'
);

export const chunkUrlsForWorkers = (urls: string[], workers: number): string[][] => {
    const baseSize = Math.floor(urls.length / workers);
    const remainder = urls.length % workers;
    const chunks: string[][] = [];
    let cursor = 0;
    for (let workerIndex = 0; workerIndex < workers; workerIndex++) {
        const size = baseSize + (workerIndex < remainder ? 1 : 0);
        chunks.push(urls.slice(cursor, cursor + size));
        cursor += size;
    }
    return chunks;
};

type ChildResponse = { ok: true; output: ScrapeRunOutput } | { ok: false; error: string };

const buildChunkFailureOutput = (workerIndex: number, childOptions: RunCliOptions, message: string): ScrapeRunOutput => {
    log.error(`Worker ${String(workerIndex)}: ${message}`);
    const now = new Date().toISOString();
    const results = childOptions.targetUrls.map((targetUrl) => (
        buildFailedOutput(targetUrl, randomUUID(), message, childOptions.browserSessionMode)
    ));
    return buildRunOutput(
        childOptions.target,
        childOptions.scraper,
        getTargetPlugin(childOptions.target).getProfileDir(childOptions.profileRootDir, childOptions.browserSessionMode),
        childOptions.browserSessionMode,
        randomUUID(),
        now,
        now,
        childOptions.concurrency,
        childOptions.targetUrls.length,
        { present: false },
        results,
    );
};

const runWorkerChild = (workerIndex: number, childOptions: RunCliOptions): Promise<ScrapeRunOutput> => (
    new Promise((resolve) => {
        let settled = false;
        let child: ChildProcess;

        const settle = (output: ScrapeRunOutput): void => {
            if (settled) return;
            settled = true;
            resolve(output);
        };

        try {
            child = fork(childModulePath);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            settle(buildChunkFailureOutput(workerIndex, childOptions, `failed to start worker process: ${message}`));
            return;
        }

        child.on('message', (message: ChildResponse) => {
            if (message.ok) settle(message.output);
            else settle(buildChunkFailureOutput(workerIndex, childOptions, message.error));
        });
        child.on('error', (error) => {
            settle(buildChunkFailureOutput(workerIndex, childOptions, error.message));
        });
        child.on('exit', (code) => {
            if (!settled) settle(buildChunkFailureOutput(workerIndex, childOptions, `worker process exited early (code ${String(code)})`));
        });

        child.send({ options: childOptions });
    })
);

export const runWorkerPool = async (options: RunCliOptions): Promise<ScrapeRunOutput> => {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const chunks = chunkUrlsForWorkers(options.targetUrls, options.workers)
        .map((chunk, index) => ({ chunk, index }))
        .filter(({ chunk }) => chunk.length > 0);

    log.info(`Worker pool: ${String(chunks.length)} worker(s) x ${String(options.workerConcurrency)} tab(s), ${String(options.targetUrls.length)} URL(s) total.`);

    const childOutputs = await Promise.all(chunks.map(async ({ chunk, index }) => {
        if (index > 0 && options.workerStartDelayMs > 0) await sleep(index * options.workerStartDelayMs);
        const childOptions: RunCliOptions = {
            ...options,
            targetUrls: chunk,
            concurrency: options.workerConcurrency,
            outputFile: undefined,
            profileRootDir: needsPerWorkerProfileDir(options)
                ? join(options.profileRootDir, `worker-${String(index)}`)
                : options.profileRootDir,
        };
        return runWorkerChild(index, childOptions);
    }));

    const results: ScrapeItemOutput[] = childOutputs.flatMap((output) => output.results);
    const videos = childOutputs.map((output) => output.artifacts.video).filter((video) => video.present);
    let video: VideoArtifact = { present: false };
    if (videos.length > 0) {
        video = videos[0];
        if (videos.length > 1) log.info(`Recorded ${String(videos.length)} worker videos (one per worker process).`);
    }

    return buildRunOutput(
        options.target,
        options.scraper,
        getTargetPlugin(options.target).getProfileDir(options.profileRootDir, options.browserSessionMode),
        options.browserSessionMode,
        runId,
        startedAt,
        new Date().toISOString(),
        options.workerConcurrency,
        options.targetUrls.length,
        video,
        results,
        { workers: chunks.length, workerConcurrency: options.workerConcurrency },
    );
};
