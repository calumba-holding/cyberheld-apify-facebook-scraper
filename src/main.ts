import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { Actor, log } from 'apify';

import { runWithExternalChrome, runWithManagedBrowser } from './external-chrome.js';
import { parseInput } from './input.js';
import { buildFailedDatasetItem, buildSuccessDatasetItem, type VideoArtifact } from './output-item.js';

const persistVideoArtifact = async (jobId: string, localPath?: string): Promise<VideoArtifact> => {
    if (!localPath) return { present: false };

    const extension = extname(localPath).toLowerCase() === '.webm' ? '.webm' : '.mp4';
    const key = `recordings-${jobId}${extension}`;
    const contentType: VideoArtifact['contentType'] = extension === '.webm' ? 'video/webm' : 'video/mp4';

    try {
        const buffer = await readFile(localPath);
        await Actor.setValue(key, buffer, { contentType });
        return {
            present: true,
            key,
            contentType,
            localPath,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warning(`Could not persist video artifact from ${localPath}: ${message}`);
        return { present: false, localPath };
    }
};

await Actor.init();
Actor.on('aborting', async () => {
    log.warning('Aborting signal received. Exiting gracefully...');
    await delay(1000);
    await Actor.exit();
});

const input = parseInput(await Actor.getInput());
const jobId = randomUUID();

let processed = 0;
let failed = 0;

try {
    const scrapeResult = input.browserMode === 'cdp'
        ? await runWithExternalChrome(input)
        : await runWithManagedBrowser(input);

    const videoArtifact = await persistVideoArtifact(jobId, scrapeResult.videoPath);
    const datasetItem = buildSuccessDatasetItem(scrapeResult, jobId, input.browserMode, videoArtifact);

    await Actor.pushData(datasetItem);
    processed = 1;

    await Actor.setValue('RUN_SUMMARY', {
        jobId,
        status: datasetItem.scrape.status,
        processed,
        failed,
        finishedAt: new Date().toISOString(),
    });

    log.info(`Crawler finished. Processed: ${processed}, failed: ${failed}.`);
} catch (error) {
    failed = 1;
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Crawler failed: ${message}`);

    const failedItem = buildFailedDatasetItem(input.url, jobId, input.browserMode, message);
    await Actor.pushData(failedItem);

    await Actor.setValue('RUN_SUMMARY', {
        jobId,
        status: 'FAILED',
        processed,
        failed,
        error: message,
        finishedAt: new Date().toISOString(),
    });
}

await Actor.exit();
