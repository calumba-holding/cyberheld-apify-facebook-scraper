import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input } from 'node:process';
import { fileURLToPath } from 'node:url';

import { startScreenRecording, type ScreenRecording } from '../common/screen-recording.js';
import { log, setVerboseLogging } from '../common/logger.js';
import { buildFailedOutput, buildRunOutput, buildSuccessOutput, type ScrapeItemOutput, type ScrapeRunOutput, type VideoArtifact } from '../facebook/output-item.js';
import { getTargetPlugin } from '../registry.js';
import type { FacebookScrapeResult } from '../facebook/types.js';
import type { TargetPlugin } from '../common/types.js';
import { helpText } from './parse.js';
import type { ParsedCli, ProfileStatusOutput, RunCliOptions } from './types.js';

const ensureParentDirectory = async (filePath: string): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true });
};

const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
    await ensureParentDirectory(filePath);
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const emitJson = async (outputJson: ScrapeRunOutput | ProfileStatusOutput, outputFile?: string): Promise<void> => {
    if (outputFile) await writeJsonFile(outputFile, outputJson);
    process.stdout.write(`${JSON.stringify(outputJson, null, 2)}\n`);
};

const mapLimit = async <T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const runWorker = async (): Promise<void> => {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= items.length) return;
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    };

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
    return results;
};

const resolveVideoPath = async (options: RunCliOptions, runId: string): Promise<string> => {
    const videoFileName = `${runId}.mp4`;

    if (options.outputFile) {
        await ensureParentDirectory(options.outputFile);
        return join(dirname(options.outputFile), videoFileName);
    }

    const artifactDir = join(options.artifactRootDir, runId);
    await mkdir(artifactDir, { recursive: true });
    return join(artifactDir, videoFileName);
};

const stopRecorder = async (recorder: ScreenRecording | null): Promise<VideoArtifact> => {
    if (!recorder) return { present: false };
    const finalizedVideoPath = await recorder.stop().catch(() => undefined);
    return finalizedVideoPath ? { present: true, localPath: finalizedVideoPath } : { present: false };
};

const runScrapeCommand = async (options: RunCliOptions): Promise<ScrapeRunOutput> => {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    // TODO: generalize when a second target is added
    const plugin = getTargetPlugin(options.target) as TargetPlugin<FacebookScrapeResult>;
    const profileDir = plugin.getProfileDir(options.profileRootDir);
    let recorder: ScreenRecording | null = null;
    let videoArtifact: VideoArtifact = { present: false };
    const context = await plugin.launchPersistentBrowser({
        chromeExecutable: options.chromeExecutable,
        profileRootDir: options.profileRootDir,
    });

    try {
        if (options.screenVideo) {
            recorder = await startScreenRecording(await resolveVideoPath(options, runId), options.screenIndex);
        }

        const results = await mapLimit(options.targetUrls, options.concurrency, async (targetUrl): Promise<ScrapeItemOutput> => {
            try {
                log.info(`Scraping ${targetUrl}`);
                const scrapeResult = await plugin.runScrape(context, options.scraper, targetUrl, options);
                return buildSuccessOutput(scrapeResult, runId);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log.error(`${targetUrl}: ${message}`);
                return buildFailedOutput(targetUrl, runId, message);
            }
        });

        videoArtifact = await stopRecorder(recorder);
        recorder = null;

        return buildRunOutput(
            options.target,
            options.scraper,
            profileDir,
            runId,
            startedAt,
            new Date().toISOString(),
            options.concurrency,
            options.targetUrls.length,
            videoArtifact,
            results,
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        videoArtifact = await stopRecorder(recorder);

        return buildRunOutput(
            options.target,
            options.scraper,
            profileDir,
            runId,
            startedAt,
            new Date().toISOString(),
            options.concurrency,
            options.targetUrls.length,
            videoArtifact,
            options.targetUrls.map((targetUrl) => buildFailedOutput(targetUrl, runId, message)),
        );
    } finally {
        await context.close().catch(() => undefined);
    }
};

const runProfileLoginCommand = async (target: RunCliOptions['target'], chromeExecutable: string, profileRootDir: string): Promise<ProfileStatusOutput> => {
    const plugin = getTargetPlugin(target);
    const context = await plugin.openProfileLoginBrowser({ chromeExecutable, profileRootDir });
    const profileDir = plugin.getProfileDir(profileRootDir);

    try {
        process.stderr.write(`Opened persistent profile at ${profileDir}\n`);
        process.stderr.write(`Log into ${target}, then press Enter here when ready.\n`);
        const rl = createInterface({ input, output: process.stderr });
        await rl.question('Press Enter after login is complete... ');
        rl.close();
        return { target, profileDir, status: 'ready' };
    } finally {
        await context.close().catch(() => undefined);
    }
};

export const runCli = async (parsed: ParsedCli): Promise<void> => {
    if (parsed.kind === 'help') {
        process.stdout.write(`${parsed.text}\n`);
        return;
    }

    if (parsed.kind === 'version') {
        const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
        const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { version: string };
        process.stdout.write(`${pkg.version}\n`);
        return;
    }

    if (parsed.kind === 'profile-path') {
        await emitJson({
            target: parsed.options.target,
            profileDir: getTargetPlugin(parsed.options.target).getProfileDir(parsed.options.profileRootDir),
            status: 'ok',
        });
        return;
    }

    if (parsed.kind === 'profile-login') {
        setVerboseLogging(parsed.options.verbose);
        await emitJson(await runProfileLoginCommand(parsed.options.target, parsed.options.chromeExecutable, parsed.options.profileRootDir));
        return;
    }

    setVerboseLogging(parsed.options.verbose);
    const outputJson = await runScrapeCommand(parsed.options);
    await emitJson(outputJson, parsed.options.outputFile);
    if (outputJson.summary.failed > 0) process.exitCode = 1;
};

export const printCliError = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${helpText}\n`);
};
